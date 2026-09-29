"""Saved projects: persist a session to disk and restore it into the in-memory checkpointer.

The graph itself keeps using MemorySaver (as required). After every run the latest state is
saved as JSON; opening a project writes that state back into a fresh MemorySaver thread with
graph.update_state(..., as_node=<the node before the paused one>), so the graph resumes exactly
where it stopped (e.g. waiting for an answer, an approval or the report review)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional

from langchain_core.messages import messages_from_dict, messages_to_dict

from .state import ResearchState

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "projects"
MAX_EVENTS = 1500

# for each node the graph can be paused before: a node whose outgoing edge leads to it
# (the routing functions read the restored state, e.g. phase / brief_approved / review_action)
PREDECESSOR = {
    "ask_user": "interviewer", "approve_brief": "interviewer", "interviewer": "ask_user",
    "researcher": "approve_brief", "judge": "researcher", "approve_more_research": "judge",
    "analyst": "judge", "approve_scope": "analyst", "reporter": "analyst",
    "report_review": "reporter", "report_editor": "report_review",
}


def _path(project_id: str) -> Path:
    if not project_id.replace("-", "").isalnum():  # ids are uuids; never build paths from anything else
        raise ValueError("bad project id")
    return DATA_DIR / f"{project_id}.json"


def save(project_id: str, state: ResearchState, next_nodes: list, chat: list, notes: list, events: list,
         extras: Optional[dict] = None) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = {
        "id": project_id,
        "title": state.brief.title if state.brief else state.idea[:80],
        "idea": state.idea,
        "phase": state.phase,
        "updated_at": time.time(),
        "next": next_nodes,
        "counts": {"datasets": len(state.datasets), "papers": len(state.papers), "report_version": state.report_version},
        "state": state.model_dump(mode="json", exclude={"messages"}),
        "messages": messages_to_dict(state.messages),
        "chat": chat,
        "pending_notes": notes,
        "events": events[-MAX_EVENTS:],
        "extras": extras or {},
    }
    tmp = _path(project_id).with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(_path(project_id))  # atomic: never leaves a half-written project


def load(project_id: str) -> Optional[dict]:
    path = _path(project_id)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def list_projects() -> list[dict]:
    if not DATA_DIR.exists():
        return []
    out = []
    for f in DATA_DIR.glob("*.json"):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        out.append({k: d.get(k) for k in ("id", "title", "idea", "phase", "updated_at", "counts")})
    return sorted(out, key=lambda d: -(d["updated_at"] or 0))


def delete(project_id: str) -> None:
    _path(project_id).unlink(missing_ok=True)


def restore_state(data: dict) -> tuple[ResearchState, Optional[str]]:
    """Rebuild the state and pick the node to write it 'as', so the graph's next step is the saved one.
    A finished project is reopened at the report review, so the user can keep elaborating on it."""
    state = ResearchState.model_validate({**data["state"], "messages": messages_from_dict(data["messages"])})
    next_nodes = data.get("next") or []
    if not next_nodes:  # finished -> reopen at the report review
        state = state.model_copy(update={"phase": "report_review", "review_action": None})
        return state, "reporter"
    return state, PREDECESSOR.get(next_nodes[0])
