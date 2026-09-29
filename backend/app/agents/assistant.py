"""The chat assistant the user talks to after the interview (the single "Research Assistant" voice).

It answers from the checkpointed state and can request an action (research more, edit the report,
change project features). The server carries actions out through the existing graph workflow
(interrupt/resume), never by bypassing it. It also answers source-specific questions (Ask AI)."""
from __future__ import annotations

import json

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from ..llm import get_llm, structured, text_of
from ..state import AssistantReply, ResearchState

SYSTEM = """You are the user's Research Assistant (a team of agents works behind you: Researcher, Judge,
Analyst, Reporter). Answer questions about the project, datasets, papers, the Judge's verdicts, the
analysis and the report, using the project state below. Be concise and specific; cite papers by title.

If the user asks you to DO something, set `action`:
- research: find more papers/datasets (e.g. "find papers about X", "research this gap") -> put a precise
  search instruction in `instruction`.
- edit_report: change the report ("make related work shorter", "add paper X") -> instruction.
- update_project: add/remove project features ("remove face recognition") -> add_features / remove_features
  (remove_features spelled exactly as in the brief).
Otherwise action = none. If the user shares a new idea, put it in `add_note`.
Your `reply` should say what you did or will do.

PROJECT STATE
{state}"""


def _compact_state(s: ResearchState) -> str:
    view = {
        "phase": s.phase,
        "brief": s.brief.model_dump() if s.brief else None,
        "user_notes": s.user_notes,
        "project_changes": s.project_changes,
        "research_round": s.research_round,
        "gaps": [g.model_dump() for g in s.gap_details] or s.gaps,
        "coverage_score": s.coverage_score,
        "judge_summary": s.judge_summary,
        "analyst": s.analysis.model_dump() if s.analysis else None,
        "datasets": [{"id": d.id, "title": d.title, "url": d.url,
                      "verdict": s.dataset_verdicts[d.id].model_dump() if d.id in s.dataset_verdicts else None}
                     for d in s.datasets],
        "papers": [{"id": p.id, "title": p.title, "year": p.year,
                    "verdict": s.paper_verdicts[p.id].model_dump() if p.id in s.paper_verdicts else None}
                   for p in s.papers],
        "report_excerpt": (s.report_markdown or "")[:4000],
    }
    return json.dumps(view)[:40000]


def _history(history: list[dict]) -> list:
    return [HumanMessage(h["content"]) if h["role"] == "user" else AIMessage(h["content"]) for h in history[-10:]]


def assistant_reply(state: ResearchState, history: list[dict], message: str) -> AssistantReply:
    msgs = [SystemMessage(SYSTEM.format(state=_compact_state(state))), *_history(history), HumanMessage(message)]
    return structured(AssistantReply).invoke(msgs)


SOURCE_SYSTEM = """You are the user's Research Assistant, discussing ONE specific source with them.
Answer only from the source material below and the project context. If the material does not contain
the answer (e.g. only the abstract is available), say so plainly instead of guessing. Be concise.
Quote short phrases from the source when useful.

PROJECT
{project}

SOURCE
{source}"""


def source_reply(state: ResearchState, source_text: str, history: list[dict], message: str) -> str:
    project = json.dumps({"brief": state.brief.model_dump() if state.brief else None,
                          "notes": state.user_notes})[:6000]
    msgs = [SystemMessage(SOURCE_SYSTEM.format(project=project, source=source_text[:60000])),
            *_history(history), HumanMessage(message)]
    return text_of(get_llm().invoke(msgs))
