"""Human-in-the-loop nodes. Each pauses the graph with interrupt(); MemorySaver keeps the
state until the UI resumes it with Command(resume=...). Nodes re-run from the top on resume,
so interrupt() is the first thing they do.

Every resume value is a dict. It may carry "notes": new project ideas the user gave the
side-chat assistant while the graph was paused; they are merged into state.user_notes here."""
from __future__ import annotations

from langchain_core.messages import HumanMessage
from langgraph.types import interrupt

from ..state import ProjectBrief, ResearchState


def _with_notes(state: ResearchState, decision: dict, update: dict) -> dict:
    if decision.get("notes"):
        update["user_notes"] = state.user_notes + list(decision["notes"])
    return update


def ask_user_node(state: ResearchState) -> dict:
    # resume value: {"answer": str}
    decision = interrupt({"type": "question", "question": state.messages[-1].content})
    return _with_notes(state, decision, {
        "messages": [HumanMessage(str(decision.get("answer", "")))],
        "log": [{"node": "ask_user"}],
    })


def approve_brief_node(state: ResearchState) -> dict:
    # resume value: {"approved": bool, "feedback": str, "brief": optional edited brief dict}
    decision = interrupt({"type": "approve_brief", "brief": state.brief.model_dump()})
    brief = ProjectBrief(**decision["brief"]) if decision.get("brief") else state.brief
    if decision.get("approved"):
        update = {"brief": brief, "brief_approved": True, "phase": "research",
                  "log": [{"node": "approve_brief", "approved": True}]}
    else:
        update = {
            "brief": brief, "brief_approved": False, "phase": "interview",
            "messages": [HumanMessage(f"I don't approve the brief yet. {decision.get('feedback', '')}")],
            "log": [{"node": "approve_brief", "approved": False}],
        }
    return _with_notes(state, decision, update)


def approve_more_research_node(state: ResearchState) -> dict:
    # resume value: {"approved": bool, "extra_focus": optional str}
    decision = interrupt({
        "type": "approve_more_research", "gaps": state.gaps, "coverage_score": state.coverage_score,
        "round": state.research_round, "summary": state.judge_summary,
    })
    gaps = state.gaps + ([decision["extra_focus"]] if decision.get("extra_focus") else [])
    approved = bool(decision.get("approved"))
    return _with_notes(state, decision, {
        "more_research_approved": approved, "gaps": gaps,
        "phase": "research" if approved else "analysis",
        "log": [{"node": "approve_more_research", "approved": approved}],
    })


def approve_scope_node(state: ResearchState) -> dict:
    """The Analyst found the topic vague / too broad / infeasible / already solved.
    resume value: {"action": "adopt" | "keep"} - adopt rewrites the brief and researches the refined scope."""
    a = state.analysis
    decision = interrupt({
        "type": "scope_review", "topic_assessment": a.topic_assessment, "reasoning": a.assessment_reasoning,
        "concerns": a.critical_concerns, "refined_scope": a.refined_scope,
        "refined_research_questions": a.refined_research_questions,
    })
    action = "adopt" if decision.get("action") == "adopt" else "keep"
    update = {"scope_reviewed": True, "scope_decision": action,
              "log": [{"node": "approve_scope", "action": action}]}
    if action == "adopt":
        update["brief"] = state.brief.model_copy(update={
            "goal": a.refined_scope, "research_questions": a.refined_research_questions})
        update["gaps"] = [f"Refined scope: {a.refined_scope}"] + a.refined_research_questions
        update["phase"] = "research"
    else:
        update["phase"] = "reporting"
    return _with_notes(state, decision, update)


def report_review_node(state: ResearchState) -> dict:
    # resume value: {"action": "edit" | "research_more" | "finish", "instruction": str, "section": optional heading}
    decision = interrupt({"type": "report_review", "report_version": state.report_version})
    action = decision.get("action", "finish")
    instruction = decision.get("instruction") or None
    update = {"review_action": action, "pending_instruction": instruction,
              "pending_section": decision.get("section") or None,
              "log": [{"node": "report_review", "action": action}]}
    if action == "research_more":
        update["gaps"] = state.gaps + ([instruction] if instruction else [])
        update["phase"] = "research"
    elif action == "finish":
        update["phase"] = "done"
    return _with_notes(state, decision, update)
