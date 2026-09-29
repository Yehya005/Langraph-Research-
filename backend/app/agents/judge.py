"""Agent 3 - Judge: inspects datasets, reads papers, scores them in small batches (VerdictBatch, SOM)
and makes a final assessment (JudgeReport, SOM) that drives the conditional edge."""
from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from ..activity import emit
from ..llm import structured
from ..state import JudgeReport, ResearchState, VerdictBatch
from ..tools import JUDGE_TOOLS
from .researcher import _brief_text
from .tool_loop import run_tool_loop

BATCH_SIZE = 8

INSPECT_SYSTEM = """You are the Judge agent. Before scoring, gather evidence with your tools:
- inspect_huggingface_dataset / inspect_kaggle_dataset on the most promising datasets (max ~6),
- read_paper on the most relevant papers (max ~5) so you can quote real excerpts.
Ignore candidates that are obviously off-topic. Call tools in parallel.
When you have enough evidence reply with one line: DONE."""

VERDICT_SYSTEM = """You are the Judge agent. Critically evaluate ONLY the candidates listed, for the
project brief, using the evidence given. Return one verdict per candidate, using its id exactly.

Datasets: is_valid, usefulness (0-1), which brief features it covers, caveats (size, license,
quality) in `notes`, and `used_for`. Be skeptical: a synthetic, simulated or toy dataset (generated
rows, suspiciously perfect coverage of every feature, no real source) gets usefulness at most 0.5
and must be called synthetic in `notes`; tiny datasets and missing labels also lower the score.
Papers: relevance (0-1), `value_added`, up to 2 key findings, up to 2 highlights that are VERBATIM
quotes from the evidence text (never invent quotes; leave highlights empty if there is no text),
`used_for`, and `related_features`: which brief features / research questions it informs (copy
their wording from the brief).
Be concise: every text field at most 30 words. Off-topic items get a score of 0 and a
one-sentence explanation."""

ASSESS_SYSTEM = """You are the Judge agent. Given all scored material for the project brief, list the
gaps (brief features no useful dataset covers, research questions no relevant paper answers) - for each
gap name the affected brief feature or research question, what is missing, the evidence that shows it,
and why more research would help. Set
coverage_score (0-1), set needs_more_research=true only if another search round would clearly help,
and write a 2-4 sentence summary."""


def _dataset_line(d) -> str:
    return f"- {d.id} | {d.title} | downloads={d.downloads} likes={d.likes} | tags={d.tags[:6]} | {d.description}"


def _paper_line(p) -> str:
    return f"- {p.id} | {p.title} ({p.year}, citations={p.citation_count}) | {p.abstract[:600]}"


def _judge_batch(brief: str, datasets: list, papers: list, observations: list[str]) -> VerdictBatch | None:
    ids = [x.id for x in datasets + papers]
    evidence = [o for o in observations if any(i in o or i.split(":", 1)[-1] in o for i in ids)]
    prompt = (f"PROJECT BRIEF\n{brief}\n\nCANDIDATES\nDATASETS:\n" + ("\n".join(map(_dataset_line, datasets)) or "none")
              + "\nPAPERS:\n" + ("\n".join(map(_paper_line, papers)) or "none")
              + "\n\nEVIDENCE FROM TOOLS\n" + ("\n\n".join(evidence) or "none"))
    for _ in range(2):  # one retry if the JSON fails to parse / validate
        try:
            return structured(VerdictBatch).invoke([SystemMessage(VERDICT_SYSTEM), HumanMessage(prompt)])
        except Exception as e:
            print(f"[judge] batch failed ({type(e).__name__}), retrying")
    return None


def judge_paper(state: ResearchState, paper, text: str):
    """Score one paper (e.g. a user upload) with the Judge's verdict step. Returns a PaperVerdict or None."""
    batch = _judge_batch(_brief_text(state), [], [paper], [f"[read_paper({paper.id})]\n{text[:7000]}"])
    return next((v for v in (batch.paper_verdicts if batch else []) if v.item_id == paper.id), None)


def judge_node(state: ResearchState) -> dict:
    brief = _brief_text(state)
    new_d = [d for d in state.datasets if d.id not in state.dataset_verdicts]
    new_p = [p for p in state.papers if p.id not in state.paper_verdicts]

    # 1) evidence gathering with the Judge's own toolset
    new_items = "DATASETS:\n" + "\n".join(map(_dataset_line, new_d)) + "\nPAPERS:\n" + "\n".join(map(_paper_line, new_p))
    emit("judge", "status", f"Gathering evidence on {len(new_d)} datasets and {len(new_p)} papers")
    evidence = run_tool_loop(INSPECT_SYSTEM, f"PROJECT BRIEF\n{brief}\n\nNEW CANDIDATES\n{new_items}",
                             JUDGE_TOOLS, max_steps=2, agent="judge")

    # 2) verdicts in small batches (SOM)
    known_d, known_p = {d.id for d in state.datasets}, {p.id for p in state.papers}
    dv, pv = dict(state.dataset_verdicts), dict(state.paper_verdicts)
    items = [("d", d) for d in new_d] + [("p", p) for p in new_p]
    failed = 0
    n_batches = (len(items) + BATCH_SIZE - 1) // BATCH_SIZE
    for i in range(0, len(items), BATCH_SIZE):
        chunk = items[i:i + BATCH_SIZE]
        b = i // BATCH_SIZE + 1
        emit("judge", "status", f"Scoring batch {b}/{n_batches} ({len(chunk)} items)")
        batch = _judge_batch(brief, [x for k, x in chunk if k == "d"], [x for k, x in chunk if k == "p"],
                             evidence.observations)
        if batch is None:
            failed += len(chunk)
            emit("judge", "decision", f"Batch {b} could not be parsed - skipped")
            continue
        titles = {x.id: x.title for _, x in chunk}
        emit("judge", "score", f"Batch {b} scored", scores=(
            [{"title": titles.get(v.item_id, v.item_id), "score": v.usefulness, "note": v.notes} for v in batch.dataset_verdicts]
            + [{"title": titles.get(v.item_id, v.item_id), "score": v.relevance, "note": v.value_added} for v in batch.paper_verdicts]))
        # keep only verdicts for items that really exist (the LLM may mangle an id)
        dv.update({v.item_id: v for v in batch.dataset_verdicts if v.item_id in known_d})
        pv.update({v.item_id: v for v in batch.paper_verdicts if v.item_id in known_p})

    # 3) overall assessment -> gaps / coverage / needs_more_research (drives the conditional edge)
    ds = {d.id: d for d in state.datasets}
    ps = {p.id: p for p in state.papers}
    scored = "\n".join(
        [f"- DATASET {ds[k].title}: usefulness={v.usefulness}, covers={v.covered_features}" for k, v in dv.items() if v.usefulness >= 0.3]
        + [f"- PAPER {ps[k].title}: relevance={v.relevance}, {v.value_added}" for k, v in pv.items() if v.relevance >= 0.3]
    ) or "nothing useful found yet"
    report: JudgeReport = structured(JudgeReport).invoke([
        SystemMessage(ASSESS_SYSTEM),
        HumanMessage(f"PROJECT BRIEF\n{brief}\n\nUSEFUL MATERIAL SO FAR (score >= 0.3)\n{scored}"),
    ])
    emit("judge", "decision", f"Coverage {round(report.coverage_score * 100)}% - "
         + ("another research round would help" if report.needs_more_research else "good enough to move on"),
         gaps=[g.title for g in report.gaps])

    return {
        "dataset_verdicts": dv,
        "paper_verdicts": pv,
        "gaps": [f"{g.title}: {g.explanation}" for g in report.gaps],
        "gap_details": report.gaps,
        "coverage_score": report.coverage_score,
        "needs_more_research": report.needs_more_research,
        "judge_summary": report.summary,
        "log": [{"node": "judge", "round": state.research_round, "inspections": len(evidence.calls),
                 "judged": len(items) - failed, "failed": failed, "coverage": report.coverage_score,
                 "needs_more_research": report.needs_more_research, "gaps": len(report.gaps)}],
    }
