"""Agent 2 - Researcher: searches Kaggle, Hugging Face, arXiv and Semantic Scholar."""
from __future__ import annotations

from ..activity import emit
from ..state import Dataset, Paper, ResearchState
from ..tools import RESEARCHER_TOOLS
from .tool_loop import run_tool_loop

SYSTEM = """You are the Researcher agent. Find datasets and related papers for the project below.

Rules:
- Datasets: search for every important feature / data need. Use BOTH search_kaggle_datasets and
  search_huggingface_datasets. Queries must be short (2-5 words), like a search box.
- Papers: search for every research question. Use BOTH search_arxiv and search_semantic_scholar.
- Call many tools in parallel in one step. Do not repeat these previous queries: {previous}
- When you have enough results, stop calling tools and reply with one line: DONE."""


def _brief_text(state: ResearchState) -> str:
    b = state.brief
    return (f"Title: {b.title}\nGoal: {b.goal}\nDomain: {b.domain}\nTask: {b.problem_type}\n"
            f"Target: {b.target_variable}\nFeatures: {b.features}\nConstraints: {b.constraints}\n"
            f"Research questions: {b.research_questions}\nKeywords: {b.keywords}\n"
            f"User notes: {state.user_notes}")


def researcher_node(state: ResearchState) -> dict:
    rnd = state.research_round + 1
    if rnd == 1:
        task = f"PROJECT BRIEF\n{_brief_text(state)}\n\nDo the initial search."
    else:
        task = (f"PROJECT BRIEF\n{_brief_text(state)}\n\nThe Judge found these GAPS - search specifically "
                f"to fill them:\n- " + "\n- ".join(state.gaps))

    emit("researcher", "status", "Round 1: planning searches for every feature and research question" if rnd == 1
         else f"Round {rnd}: searching to fill {len(state.gaps)} gap(s) found by the Judge/Analyst")
    res = run_tool_loop(SYSTEM.format(previous=state.search_queries or "none"), task, RESEARCHER_TOOLS,
                        max_steps=3, agent="researcher")

    known_d = {d.id for d in state.datasets}
    known_p = {p.id for p in state.papers}
    new_d, new_p = [], []
    for item in res.artifacts:
        item = {**item, "research_round": rnd}
        if item["source"] in ("kaggle", "huggingface") and item["id"] not in known_d:
            new_d.append(Dataset(**item)); known_d.add(item["id"])
        elif item["source"] in ("arxiv", "semantic_scholar") and item["id"] not in known_p:
            new_p.append(Paper(**item)); known_p.add(item["id"])

    emit("researcher", "decision", f"{len(res.calls)} searches -> {len(new_d)} new datasets, {len(new_p)} new papers "
         f"(duplicates removed)")
    queries = [f"{c['tool']}: {c['args'].get('query', '')}" for c in res.calls]
    return {
        "research_round": rnd,
        "datasets": state.datasets + new_d,
        "papers": state.papers + new_p,
        "search_queries": state.search_queries + queries,
        "more_research_approved": None,
        "needs_reevaluation": False,
        "phase": "judging",
        "log": [{"node": "researcher", "round": rnd, "tool_calls": len(res.calls),
                 "new_datasets": len(new_d), "new_papers": len(new_p)}],
    }
