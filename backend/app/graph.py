"""LangGraph wiring: nodes, conditional edges, MemorySaver checkpointer.

START -> interviewer -(brief incomplete)-> ask_user -> interviewer ...
                     -(brief complete)--> approve_brief -(rejected)-> interviewer
                                                        -(approved)-> researcher -> judge
judge -(gaps & rounds left)-> approve_more_research -(yes)-> researcher
      -(good enough)--------> analyst               -(no)--> analyst
analyst -(topic vague/too broad/infeasible/solved, not reviewed yet)-> approve_scope
        -(well defined)-> reporter
approve_scope -(adopt refined scope)-> researcher     -(keep)-> reporter
reporter -> report_review -(edit)-> report_editor -> report_review
                          -(research_more)-> researcher
                          -(finish)-> END
"""
from __future__ import annotations

import time

from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.graph import END, START, StateGraph

from .agents.analyst import analyst_node
from .agents.human import (approve_brief_node, approve_more_research_node, approve_scope_node,
                           ask_user_node, report_review_node)
from .agents.interviewer import interviewer_node
from .agents.judge import judge_node
from .agents.reporter import report_editor_node, reporter_node
from .agents.researcher import researcher_node
from .state import (Dataset, DatasetVerdict, DraftBrief, GapDetail, Highlight, Opportunity, Paper, PaperVerdict,
                    ProblemAnalysis, ProjectBrief, ResearchState, Theme)


# ---- conditional edge functions -------------------------------------------------

def route_after_interviewer(state: ResearchState) -> str:
    return "approve_brief" if state.phase == "brief_approval" else "ask_user"


def route_after_brief_approval(state: ResearchState) -> str:
    return "researcher" if state.brief_approved else "interviewer"


def route_after_judge(state: ResearchState) -> str:
    if state.needs_more_research and state.gaps and state.research_round < state.max_research_rounds:
        return "approve_more_research"
    return "analyst"


def route_after_more_research_approval(state: ResearchState) -> str:
    return "researcher" if state.more_research_approved else "analyst"


def route_after_analyst(state: ResearchState) -> str:
    # critical-thinking gate: a vague / infeasible / solved topic goes to the user once
    return "approve_scope" if state.phase == "scope_review" else "reporter"


def route_after_scope(state: ResearchState) -> str:
    return "researcher" if state.scope_decision == "adopt" else "reporter"


def route_after_review(state: ResearchState) -> str:
    return {"edit": "report_editor", "research_more": "researcher"}.get(state.review_action, END)


# ---- graph ----------------------------------------------------------------------

def _stamped(fn):
    """Add a timestamp to each log entry a node writes (used by the History timeline)."""
    def node(state):
        out = fn(state)
        for entry in (out or {}).get("log", []):
            entry.setdefault("ts", time.time())
        return out
    node.__name__ = fn.__name__
    return node


def build_graph(checkpointer=None):
    g = StateGraph(ResearchState)

    g.add_node("interviewer", _stamped(interviewer_node))
    g.add_node("ask_user", _stamped(ask_user_node))
    g.add_node("approve_brief", _stamped(approve_brief_node))
    g.add_node("researcher", _stamped(researcher_node))
    g.add_node("judge", _stamped(judge_node))
    g.add_node("approve_more_research", _stamped(approve_more_research_node))
    g.add_node("analyst", _stamped(analyst_node))
    g.add_node("approve_scope", _stamped(approve_scope_node))
    g.add_node("reporter", _stamped(reporter_node))
    g.add_node("report_review", _stamped(report_review_node))
    g.add_node("report_editor", _stamped(report_editor_node))

    g.add_edge(START, "interviewer")
    g.add_conditional_edges("interviewer", route_after_interviewer, ["approve_brief", "ask_user"])
    g.add_edge("ask_user", "interviewer")
    g.add_conditional_edges("approve_brief", route_after_brief_approval, ["researcher", "interviewer"])
    g.add_edge("researcher", "judge")
    g.add_conditional_edges("judge", route_after_judge, ["approve_more_research", "analyst"])
    g.add_conditional_edges("approve_more_research", route_after_more_research_approval, ["researcher", "analyst"])
    g.add_conditional_edges("analyst", route_after_analyst, ["approve_scope", "reporter"])
    g.add_conditional_edges("approve_scope", route_after_scope, ["researcher", "reporter"])
    g.add_edge("reporter", "report_review")
    g.add_conditional_edges("report_review", route_after_review, ["report_editor", "researcher", END])
    g.add_edge("report_editor", "report_review")

    return g.compile(checkpointer=checkpointer or make_checkpointer())


def make_checkpointer() -> MemorySaver:
    # allow our Pydantic models to be (de)serialized from checkpoints
    models = [ProjectBrief, Dataset, Paper, Highlight, DatasetVerdict, PaperVerdict,
              ProblemAnalysis, Theme, Opportunity, DraftBrief, GapDetail]
    serde = JsonPlusSerializer(allowed_msgpack_modules=[(m.__module__, m.__name__) for m in models])
    return MemorySaver(serde=serde)


graph = build_graph()
