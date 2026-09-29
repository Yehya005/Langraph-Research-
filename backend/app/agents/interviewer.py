"""Agent 1 - Interviewer: step-by-step chat that extracts a ProjectBrief (Structured Output Mode)."""
from __future__ import annotations

from langchain_core.messages import AIMessage, SystemMessage

from ..activity import emit
from ..llm import structured
from ..state import InterviewTurn, ResearchState

MAX_TURNS = 10

SYSTEM = """You are an expert research consultant interviewing a student about their project idea.
Your job: collect what a researcher needs to find datasets and related papers for this project.

Choose your own interviewing strategy - adapt to the answers, go deeper where things are vague,
skip what is already clear. Ask ONE focused question per turn (you may briefly offer examples or
options to make answering easy). Keep messages short and friendly.
Never ask the same thing twice: if the user skips or dodges a question, make a reasonable
assumption from context, mention it briefly, and move on.

By the end you should know: the goal, domain, problem/task type, target variable (if any), the
features/data attributes needed, constraints (data size, license, region, time range, compute),
the research questions, and good search keywords.

Every turn, fill `draft` with everything learned from the user so far (it is shown to them live).
When you have enough (usually after 4-8 turns), set brief_complete=true, fill `brief`, and make
`reply` a concise summary of the brief asking the user to approve or correct it.
Otherwise set brief_complete=false and leave brief empty.

This is turn {turn} of at most {max_turns}.{force}
Extra notes from the user: {notes}"""


def interviewer_node(state: ResearchState) -> dict:
    turn = state.interview_turns + 1
    force = " This is the LAST turn: you MUST complete the brief now." if turn >= MAX_TURNS else ""
    system = SYSTEM.format(turn=turn, max_turns=MAX_TURNS, force=force, notes=state.user_notes or "none")

    emit("interviewer", "status", "Reading your answer and deciding what to ask next…")
    out: InterviewTurn = structured(InterviewTurn).invoke([SystemMessage(system), *state.messages])
    complete = out.brief_complete and out.brief is not None
    emit("interviewer", "decision", "Enough information collected - drafting the project brief" if complete
         else f"Need more detail - asking question {turn}")

    return {
        "messages": [AIMessage(out.reply)],
        "interview_turns": turn,
        "interview_draft": out.draft,
        "brief": out.brief if complete else state.brief,
        "phase": "brief_approval" if complete else "interview",
        "log": [{"node": "interviewer", "turn": turn, "brief_complete": complete}],
    }
