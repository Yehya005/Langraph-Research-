"""FastAPI backend for the React UI.

Graph runs happen in a background thread; the UI polls GET /api/sessions/{id}, which reads the
latest MemorySaver checkpoint, so you can watch the state change node by node. Agents' live
activity (reasoning summaries, searches, scores) arrives through LangGraph's "custom" stream
mode and is returned incrementally. Every session is auto-saved as a project (see projects.py).

State changes made from the UI outside a graph step (uploads, project edits, manual report edits)
go through _patch_state(), which writes them with graph.update_state() as the node before the
paused one, so the graph stays consistent and resumes at the same approval/question."""
from __future__ import annotations

import re
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel

from . import library, projects
from .agents.assistant import assistant_reply, source_reply
from .agents.judge import judge_paper
from .agents.material import ref_papers
from .export import to_docx, to_pdf
from .graph import graph
from .llm import PROVIDER
from .state import ProjectBrief, ResearchState
from .tools.common import kaggle_auth

app = FastAPI(title="Research Assistant (LangGraph multi-agent)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@dataclass
class Session:
    thread_id: str
    running: bool = False
    error: Optional[str] = None
    chat: list = field(default_factory=list)          # main chat after the interview [{"role", "content", "ts"}]
    pending_notes: list = field(default_factory=list)  # notes waiting for the next resume
    events: list = field(default_factory=list)         # live activity for the thinking panel
    run: int = 0                                       # graph runs so far (groups events)
    # UI-side artifacts (not agent state): paper summaries, comparisons, per-source chats, report versions
    extras: dict = field(default_factory=lambda: {"summaries": {}, "comparisons": {}, "threads": {},
                                                  "report_versions": []})
    lock: threading.Lock = field(default_factory=threading.Lock)


SESSIONS: dict[str, Session] = {}
HUMAN_NODES = {"ask_user", "approve_brief", "approve_more_research", "approve_scope", "report_review"}


def _config(s: Session) -> dict:
    return {"configurable": {"thread_id": s.thread_id}, "recursion_limit": 100}


def _get(thread_id: str) -> Session:
    if thread_id not in SESSIONS:
        raise HTTPException(404, "Unknown session")
    return SESSIONS[thread_id]


def _state(s: Session) -> tuple[Optional[ResearchState], Any]:
    snap = graph.get_state(_config(s))
    if not snap.values:
        return None, snap
    return ResearchState.model_validate(snap.values), snap


def _require_state(s: Session) -> ResearchState:
    state, _ = _state(s)
    if state is None:
        raise HTTPException(400, "This project has no state yet")
    return state


def _pending(s: Session) -> Optional[dict]:
    if s.running:
        return None
    for task in graph.get_state(_config(s)).tasks:
        if task.interrupts:
            return task.interrupts[0].value
    return None


def _track_report(s: Session, state: Optional[ResearchState]) -> None:
    """Keep every report version so the user can compare / revert."""
    if not state or not state.report_markdown:
        return
    versions = s.extras.setdefault("report_versions", [])
    if not versions or versions[-1]["markdown"] != state.report_markdown:
        versions.append({"version": state.report_version, "ts": time.time(), "markdown": state.report_markdown})


def _save(s: Session) -> None:
    try:
        state, snap = _state(s)
        if state is not None:
            _track_report(s, state)
            projects.save(s.thread_id, state, list(snap.next), s.chat, s.pending_notes, s.events, s.extras)
    except Exception:
        traceback.print_exc()  # saving must never break the app


def _run(s: Session, graph_input: Any) -> None:
    try:
        for mode, chunk in graph.stream(graph_input, _config(s), stream_mode=["updates", "custom"]):
            if mode == "custom":  # emitted by the agents (app/activity.py)
                s.events.append({**chunk, "run": s.run})
                continue
            for node in chunk:
                if node != "__interrupt__" and node not in HUMAN_NODES:
                    s.events.append({"agent": node, "kind": "node_done", "text": f"{node} finished",
                                     "run": s.run, "ts": time.time()})
            print(f"[{s.thread_id[:8]}] update: {list(chunk.keys())}")
    except Exception as e:
        traceback.print_exc()
        msg = f"{type(e).__name__}: {e}"
        s.error = msg if len(msg) < 400 else msg[:400] + "…"
    finally:
        s.running = False
        _save(s)


def _start(s: Session, graph_input: Any) -> None:
    with s.lock:
        if s.running:
            raise HTTPException(409, "The assistant is still working on the previous step")
        s.running, s.error = True, None
        s.run += 1
    threading.Thread(target=_run, args=(s, graph_input), daemon=True).start()


def _resume(s: Session, value: dict) -> None:
    value = {**value, "notes": s.pending_notes}
    s.pending_notes = []
    _start(s, Command(resume=value))


def _patch_state(s: Session, updates: dict) -> None:
    """Write UI-originated changes into the graph state without breaking the paused step."""
    if s.running:
        raise HTTPException(409, "The assistant is still working - try again when it finishes")
    nxt = list(graph.get_state(_config(s)).next)
    as_node = projects.PREDECESSOR.get(nxt[0]) if nxt else "report_review"  # finished: review_action stays 'finish'
    graph.update_state(_config(s), updates, as_node=as_node)
    if nxt and nxt[0] in HUMAN_NODES:
        for _ in graph.stream(None, _config(s)):  # re-enter the waiting node's interrupt() (no LLM call)
            pass
    _save(s)


def _reopen_review(s: Session) -> None:
    """A finished project goes back to the report review, so it can be edited / researched again."""
    graph.update_state(_config(s), {"phase": "report_review", "review_action": None}, as_node="reporter")
    for _ in graph.stream(None, _config(s)):
        pass


def _extras_view(s: Session) -> dict:
    ex = s.extras
    return {
        "summaries": ex.get("summaries", {}),
        "comparisons": ex.get("comparisons", {}),
        "threads": ex.get("threads", {}),
        "report_versions": [{k: v[k] for k in ("version", "ts")} for v in ex.get("report_versions", [])],
    }


def _view(s: Session, since: int = 0) -> dict:
    state, snap = _state(s)
    pending = None
    if not s.running:
        for task in snap.tasks:
            if task.interrupts:
                pending = task.interrupts[0].value
                break
    data = state.model_dump(mode="json", exclude={"messages"}) if state else {}
    data["messages"] = [
        {"role": "user" if isinstance(m, HumanMessage) else "assistant", "content": m.content}
        for m in (state.messages if state else [])
    ]
    data["references"] = [p.id for _, p, _ in ref_papers(state)] if state else []
    return {
        "thread_id": s.thread_id, "provider": PROVIDER, "running": s.running, "error": s.error,
        "next": list(snap.next), "pending": pending, "chat": s.chat,
        "pending_notes": s.pending_notes, "state": data,
        "events": s.events[since:], "events_total": len(s.events), "run": s.run,
        "extras": _extras_view(s),
    }


def _paper(state: ResearchState, paper_id: str):
    p = next((p for p in state.papers if p.id == paper_id), None)
    if p is None:
        raise HTTPException(404, "Paper not found in this project")
    return p


# ---- core workflow API ------------------------------------------------------------------

class NewSession(BaseModel):
    idea: str


class Resume(BaseModel):
    value: dict


class ChatIn(BaseModel):
    message: str


@app.get("/api/config")
def config():
    """What the UI may show about the environment (no secrets)."""
    import os
    return {"provider": PROVIDER,
            "model": os.getenv("CLAUDE_MODEL", "claude-opus-5") if PROVIDER == "claude" else os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            "sources": {"kaggle": kaggle_auth() is not None, "huggingface": True, "arxiv": True,
                        "semantic_scholar_key": bool(os.getenv("S2_API_KEY"))}}


@app.post("/api/sessions")
def create_session(body: NewSession):
    s = Session(thread_id=str(uuid.uuid4()))
    SESSIONS[s.thread_id] = s
    _start(s, {"idea": body.idea, "messages": [HumanMessage(f"My project idea: {body.idea}")]})
    return _view(s)


@app.get("/api/sessions/{thread_id}")
def get_session(thread_id: str, since: int = 0):
    """since = number of activity events the client already has (events are sent incrementally)."""
    return _view(_get(thread_id), since)


@app.post("/api/sessions/{thread_id}/resume")
def resume(thread_id: str, body: Resume):
    s = _get(thread_id)
    value = dict(body.value)
    # a finished project can still be edited / researched: reopen the review first
    if value.get("action") in ("edit", "research_more") and _pending(s) is None and not graph.get_state(_config(s)).next:
        _reopen_review(s)
    _resume(s, value)
    return _view(s)


@app.post("/api/sessions/{thread_id}/retry")
def retry(thread_id: str):
    """Re-run the node that failed, from the last MemorySaver checkpoint (input None = continue)."""
    s = _get(thread_id)
    _start(s, None)
    return _view(s)


def _features_update(state: ResearchState, add: list[str], remove: list[str]) -> Optional[ProjectBrief]:
    if not state.brief:
        return None
    lower = {r.strip().lower() for r in remove}
    kept = [f for f in state.brief.features if f.strip().lower() not in lower]
    added = [a for a in add if a.strip() and a.strip().lower() not in {f.lower() for f in kept}]
    if len(kept) == len(state.brief.features) and not added:
        return None
    return state.brief.model_copy(update={"features": kept + added})


def _apply_brief(s: Session, state: ResearchState, new_brief: ProjectBrief) -> list[str]:
    old = state.brief
    changes = []
    if old:
        for f in old.features:
            if f not in new_brief.features:
                changes.append(f"Removed feature: {f}")
        for f in new_brief.features:
            if f not in old.features:
                changes.append(f"Added feature: {f}")
        for name in ("title", "goal", "domain", "problem_type", "target_variable"):
            if getattr(old, name) != getattr(new_brief, name):
                changes.append(f"Changed {name.replace('_', ' ')}")
        if old.constraints != new_brief.constraints:
            changes.append("Changed constraints")
        if old.research_questions != new_brief.research_questions:
            changes.append("Changed research questions")
    if not changes:
        return []
    _patch_state(s, {
        "brief": new_brief,
        "project_changes": state.project_changes + changes,
        "needs_reevaluation": state.needs_reevaluation or state.research_round > 0,
        "log": [{"node": "project_edit", "changes": changes}],
    })
    return changes


@app.post("/api/sessions/{thread_id}/chat")
def chat(thread_id: str, body: ChatIn):
    """The main assistant chat (after the interview). Actions go through the graph workflow."""
    s = _get(thread_id)
    state = _require_state(s)
    out = assistant_reply(state, s.chat, body.message)
    reply = out.reply
    pending = _pending(s)
    finished = not s.running and not graph.get_state(_config(s)).next
    instruction = out.instruction or body.message

    if s.running and out.action != "none":
        reply += "\n\n_The team is still working on the current step - ask again when it finishes._"
    elif out.action == "update_project":
        new_brief = _features_update(state, out.add_features, out.remove_features)
        if new_brief is None:
            reply += "\n\n_No project features matched that change._"
        else:
            changes = _apply_brief(s, state, new_brief)
            reply += "\n\n_Project updated: " + "; ".join(changes) + "._"
            if state.research_round > 0:
                reply += " _Existing research may need re-evaluation._"
    elif out.action == "research":
        if pending and pending["type"] == "approve_more_research":
            _resume(s, {"approved": True, "extra_focus": instruction})
        elif (pending and pending["type"] == "report_review") or finished:
            if finished:
                _reopen_review(s)
            _resume(s, {"action": "research_more", "instruction": instruction})
        else:
            s.pending_notes.append(instruction)
            reply += "\n\n_I'll pass this to the Researcher at the next step._"
    elif out.action == "edit_report":
        if (pending and pending["type"] == "report_review") or (finished and state.report_markdown):
            if finished:
                _reopen_review(s)
            _resume(s, {"action": "edit", "instruction": instruction})
        else:
            reply += "\n\n_There is no report to edit yet._"
    if out.add_note:
        s.pending_notes.append(out.add_note)

    now = time.time()
    s.chat += [{"role": "user", "content": body.message, "ts": now},
               {"role": "assistant", "content": reply, "ts": now + 0.001, "action": out.action}]
    if not s.running:
        _save(s)
    return _view(s)


class BriefIn(BaseModel):
    brief: ProjectBrief


@app.put("/api/sessions/{thread_id}/brief")
def update_brief(thread_id: str, body: BriefIn):
    """Edit the project (research memory). Marks research for re-evaluation when it already ran."""
    s = _get(thread_id)
    state = _require_state(s)
    _apply_brief(s, state, body.brief)
    return _view(s)


# ---- papers: reader, upload, summary, comparison, source chat -----------------------------

@app.get("/api/sessions/{thread_id}/paper/text")
def paper_text(thread_id: str, paper_id: str):
    s = _get(thread_id)
    p = _paper(_require_state(s), paper_id)
    t = library.paper_text(p)
    return {**t, "has_pdf": t["full_text"], "source_url": p.url or None}


@app.get("/api/sessions/{thread_id}/paper/pdf")
def paper_pdf(thread_id: str, paper_id: str):
    s = _get(thread_id)
    p = _paper(_require_state(s), paper_id)
    try:
        data = library.pdf_bytes(p)
    except library.PaperUnavailable as e:
        raise HTTPException(404, str(e))
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": "inline"})


@app.post("/api/sessions/{thread_id}/papers/upload")
async def upload_paper(thread_id: str, file: UploadFile = File(...)):
    s = _get(thread_id)
    state = _require_state(s)
    if s.running:
        raise HTTPException(409, "The assistant is still working - upload again when it finishes")
    data = await file.read()
    try:
        name = library.save_upload(data)
        paper = library.paper_from_upload(name, file.filename or "Uploaded paper")
    except ValueError as e:
        raise HTTPException(400, str(e))
    paper = paper.model_copy(update={"research_round": max(state.research_round, 1)})
    updates = {"papers": state.papers + [paper], "log": [{"node": "upload", "title": paper.title}]}
    if state.brief:  # the Judge evaluates it like any other paper
        text, _ = library.text_for_llm(paper, limit=9000)
        verdict = judge_paper(state, paper, text)
        if verdict:
            updates["paper_verdicts"] = {**state.paper_verdicts, paper.id: verdict}
            updates["log"].append({"node": "judge_upload", "title": paper.title, "relevance": verdict.relevance})
    _patch_state(s, updates)
    return {"paper_id": paper.id, "view": _view(s)}


@app.post("/api/sessions/{thread_id}/paper/evaluate")
def evaluate_paper(thread_id: str, paper_id: str):
    s = _get(thread_id)
    state = _require_state(s)
    p = _paper(state, paper_id)
    text, _ = library.text_for_llm(p, limit=9000)
    verdict = judge_paper(state, p, text)
    if verdict is None:
        raise HTTPException(502, "The Judge could not evaluate this paper - try again")
    _patch_state(s, {"paper_verdicts": {**state.paper_verdicts, p.id: verdict},
                     "log": [{"node": "judge_upload", "title": p.title, "relevance": verdict.relevance}]})
    return _view(s)


@app.post("/api/sessions/{thread_id}/paper/summary")
def paper_summary(thread_id: str, paper_id: str, refresh: bool = False):
    s = _get(thread_id)
    state = _require_state(s)
    p = _paper(state, paper_id)
    summaries = s.extras.setdefault("summaries", {})
    if refresh or paper_id not in summaries:
        summaries[paper_id] = library.summarize(state, p)
        _save(s)
    return summaries[paper_id]


class CompareIn(BaseModel):
    paper_ids: list[str]


@app.post("/api/sessions/{thread_id}/compare")
def compare(thread_id: str, body: CompareIn):
    s = _get(thread_id)
    state = _require_state(s)
    ids = list(dict.fromkeys(body.paper_ids))
    if not 2 <= len(ids) <= 5:
        raise HTTPException(400, "Select between 2 and 5 papers to compare")
    papers = [_paper(state, i) for i in ids]
    key = ",".join(sorted(ids))
    comparisons = s.extras.setdefault("comparisons", {})
    if key not in comparisons:
        comparisons[key] = {**library.compare(state, papers), "paper_ids": ids, "ts": time.time()}
        _save(s)
    return comparisons[key]


class AskIn(BaseModel):
    kind: str            # paper | dataset | comparison | gap
    ids: list[str]
    message: str
    selection: Optional[str] = None


def _source_text(s: Session, state: ResearchState, body: AskIn) -> str:
    if body.kind == "paper":
        p = _paper(state, body.ids[0])
        text, _ = library.text_for_llm(p)
        v = state.paper_verdicts.get(p.id)
        judge = f"\nJUDGE VERDICT: {v.model_dump_json()}" if v else ""
        return text + judge
    if body.kind == "dataset":
        d = next((d for d in state.datasets if d.id == body.ids[0]), None)
        if d is None:
            raise HTTPException(404, "Dataset not found")
        v = state.dataset_verdicts.get(d.id)
        return f"DATASET: {d.model_dump_json()}\nJUDGE VERDICT: {v.model_dump_json() if v else 'not evaluated'}"
    if body.kind == "comparison":
        comp = s.extras.get("comparisons", {}).get(",".join(sorted(body.ids)))
        if comp is None:
            raise HTTPException(404, "Run the comparison first")
        titles = {p.id: p.title for p in state.papers}
        return "PAPER COMPARISON\n" + "\n".join(f"{titles.get(r['paper_id'], r['paper_id'])}: {r}" for r in comp["rows"]) \
            + f"\nCOMMON: {comp['common_ground']}\nDIFFERENCES: {comp['differences']}"
    if body.kind == "gap":
        idx = int(body.ids[0])
        gaps = state.gap_details
        return f"RESEARCH GAP: {gaps[idx].model_dump_json() if idx < len(gaps) else state.gaps[idx]}\n" \
               f"JUDGE SUMMARY: {state.judge_summary}"
    raise HTTPException(400, "Unknown source kind")


@app.post("/api/sessions/{thread_id}/ask")
def ask_source(thread_id: str, body: AskIn):
    """Source-specific conversation (Ask AI on a paper, dataset, comparison or gap)."""
    s = _get(thread_id)
    state = _require_state(s)
    source = _source_text(s, state, body)
    key = f"{body.kind}:{','.join(sorted(body.ids))}"
    thread = s.extras.setdefault("threads", {}).setdefault(key, [])
    question = body.message if not body.selection else f'About this passage: "{body.selection[:3000]}"\n\n{body.message}'
    answer = source_reply(state, source, thread, question)
    now = time.time()
    thread += [{"role": "user", "content": body.message, "selection": body.selection, "ts": now},
               {"role": "assistant", "content": answer, "ts": now + 0.001}]
    _save(s)
    return {"key": key, "thread": thread}


# ---- report --------------------------------------------------------------------------------

class ReportIn(BaseModel):
    markdown: str


@app.put("/api/sessions/{thread_id}/report")
def save_report(thread_id: str, body: ReportIn):
    """Manual edit of the report (applied as a new version)."""
    s = _get(thread_id)
    state = _require_state(s)
    if not body.markdown.strip():
        raise HTTPException(400, "The report cannot be empty")
    _patch_state(s, {"report_markdown": body.markdown, "report_version": state.report_version + 1,
                     "log": [{"node": "report_manual", "report_version": state.report_version + 1}]})
    return _view(s)


class RevertIn(BaseModel):
    version: int


@app.post("/api/sessions/{thread_id}/report/revert")
def revert_report(thread_id: str, body: RevertIn):
    s = _get(thread_id)
    state = _require_state(s)
    old = next((v for v in s.extras.get("report_versions", []) if v["version"] == body.version), None)
    if old is None:
        raise HTTPException(404, "Version not found")
    _patch_state(s, {"report_markdown": old["markdown"], "report_version": state.report_version + 1,
                     "log": [{"node": "report_revert", "from_version": body.version,
                              "report_version": state.report_version + 1}]})
    return _view(s)


@app.get("/api/sessions/{thread_id}/report/version")
def report_version(thread_id: str, version: int):
    s = _get(thread_id)
    old = next((v for v in s.extras.get("report_versions", []) if v["version"] == version), None)
    if old is None:
        raise HTTPException(404, "Version not found")
    return old


def _bibtex(state: ResearchState) -> str:
    entries = []
    for n, p, _ in ref_papers(state):
        first = (p.authors[0].split()[-1] if p.authors else "anon")
        key = re.sub(r"\W", "", f"{first}{p.year or ''}{n}").lower()
        fields = {"title": p.title, "author": " and ".join(p.authors) or "Unknown", "year": p.year, "url": p.url}
        if p.id.startswith("arxiv:"):
            fields.update(eprint=p.id.removeprefix("arxiv:"), archivePrefix="arXiv")
        body = ",\n".join(f"  {k} = {{{v}}}" for k, v in fields.items() if v)
        entries.append(f"@misc{{{key},\n{body}\n}}")
    return "\n\n".join(entries) + "\n"


EXPORTS = {
    "md": ("text/markdown; charset=utf-8", lambda st: st.report_markdown.encode("utf-8")),
    "pdf": ("application/pdf", lambda st: to_pdf(st.report_markdown)),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document",
             lambda st: to_docx(st.report_markdown)),
    "bib": ("application/x-bibtex; charset=utf-8", lambda st: _bibtex(st).encode("utf-8")),
}


@app.get("/api/sessions/{thread_id}/report.{fmt}")
def report(thread_id: str, fmt: str):
    """Download the report as Markdown, PDF, Word, or the references as BibTeX."""
    if fmt not in EXPORTS:
        raise HTTPException(404, "Format must be md, pdf, docx or bib")
    state, _ = _state(_get(thread_id))
    if not state or not state.report_markdown:
        raise HTTPException(404, "No report yet")
    media_type, convert = EXPORTS[fmt]
    name = re.sub(r"[^\w\- ]", "", state.brief.title if state.brief else "research_report").strip()[:60] or "report"
    if fmt == "bib":
        name += " references"
    return Response(convert(state), media_type=media_type, headers={
        "Content-Disposition": f'attachment; filename="{name}.{fmt}"'})


@app.get("/api/sessions/{thread_id}/history")
def history(thread_id: str):
    """Checkpoint history (newest first): evidence of partial state updates across nodes."""
    s = _get(thread_id)
    out = []
    for snap in graph.get_state_history(_config(s)):
        v = snap.values or {}
        out.append({
            "checkpoint_id": snap.config["configurable"]["checkpoint_id"],
            "step": snap.metadata.get("step"),
            "source": snap.metadata.get("source"),
            "next": list(snap.next),
            "phase": v.get("phase"),
            "interview_turns": v.get("interview_turns"),
            "brief_set": v.get("brief") is not None,
            "research_round": v.get("research_round"),
            "datasets": len(v.get("datasets", [])),
            "papers": len(v.get("papers", [])),
            "verdicts": len(v.get("dataset_verdicts", {})) + len(v.get("paper_verdicts", {})),
            "coverage_score": v.get("coverage_score"),
            "report_version": v.get("report_version"),
        })
    return out


# ---- saved projects ---------------------------------------------------------------------

@app.get("/api/projects")
def list_saved_projects():
    return projects.list_projects()


@app.post("/api/projects/{project_id}/open")
def open_project(project_id: str):
    """Load a saved project back into MemorySaver and resume it where it was paused."""
    if project_id in SESSIONS:
        return _view(SESSIONS[project_id])
    try:
        data = projects.load(project_id)
    except ValueError:
        raise HTTPException(400, "Bad project id")
    if data is None:
        raise HTTPException(404, "Project not found")

    s = Session(thread_id=project_id, chat=data.get("chat", []), pending_notes=data.get("pending_notes", []),
                events=data.get("events", []))
    s.extras.update(data.get("extras") or {})
    s.run = max((e.get("run", 0) for e in s.events), default=0)
    state, as_node = projects.restore_state(data)
    values = {name: getattr(state, name) for name in ResearchState.model_fields}
    graph.update_state(_config(s), values, as_node=as_node)
    SESSIONS[project_id] = s

    nxt = graph.get_state(_config(s)).next
    if nxt and nxt[0] in HUMAN_NODES:
        # run the waiting human node up to its interrupt() so the question/approval card reappears (no LLM call)
        for _ in graph.stream(None, _config(s)):
            pass
    elif nxt:
        s.error = f"Project restored before '{nxt[0]}', which had not finished. Press Retry to run it."
    return _view(s)


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    s = SESSIONS.get(project_id)
    if s and s.running:
        raise HTTPException(409, "The project is running")
    try:
        projects.delete(project_id)
    except ValueError:
        raise HTTPException(400, "Bad project id")
    SESSIONS.pop(project_id, None)
    return {"deleted": project_id}


# Serve the built React app (frontend/dist) at "/", so one process runs the whole system.
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
