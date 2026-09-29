"""Agent 5 - Analyst: critical analysis of the problem and of prior work (Structured Output Mode).

Turns the Judge's item-by-item verdicts into an understanding of the field: what the problem is,
what people try to fix, what has been done (synthesized by theme), what is still open, and whether
the user's topic is well-defined, feasible and novel. Its topic_assessment drives a conditional edge."""
from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from ..activity import emit
from ..llm import structured
from ..state import ProblemAnalysis, ResearchState
from .material import datasets_evidence, papers_evidence, ref_papers
from .researcher import _brief_text

SYSTEM = """You are the Analyst: a critical, experienced senior researcher advising a student.
You receive the student's project brief and the evidence collected (numbered papers, datasets,
the Judge's verdicts and gaps). Produce a critical analysis - think, do not just summarize.

1. The problem. Explain the underlying real-world/technical problem in plain words: what goes
   wrong today, for whom, and why it matters. List what the field is concretely trying to fix.
2. Prior work as a SYNTHESIS. Group the papers into 2-5 themes (approaches / lines of work). For
   each theme explain what this body of work does, what it achieves, and where it falls short,
   citing only as [n]. Never write "Paper [1] does X. Paper [2] does Y." - write the story of the
   field ("Most work treats this as ... [1][4], which works well for ... but ...").
3. Limitations. Point out weaknesses, unsolved issues and contradictions across the work.
4. Critique the student's topic honestly - be demanding, like a thesis supervisor. Judge the
   student's ORIGINAL idea and their own words, not only the brief (the interviewer may have
   filled gaps with its own assumptions). Check each point explicitly:
   - Scope: is there ONE clear task with a measurable outcome, doable by one student in about
     3 months with free compute? Goals like "fix X", "solve Y", "everywhere" are too broad/vague.
   - Novelty: is this already heavily studied? If the obvious approach is well covered by the
     evidence or common knowledge, say what would actually be new - or call it already_solved.
   - Data realism: are the datasets real or synthetic/toy? Do they really contain the labels and
     features needed? Does the task need a simulator, private data or hardware the student lacks?
   - Evaluation validity: can success be measured credibly (baselines, leakage, sim-to-real gap)?
   Pick topic_assessment = well_defined ONLY if scope, novelty angle, data and evaluation all hold
   up; otherwise choose the label that best names the main problem.
5. Contribution opportunities. 2-4 concrete angles a student could realistically contribute,
   each grounded in a gap in the evidence; never propose what the evidence shows is solved.
6. A refined scope that one student can finish: ONE core research question plus at most 2
   sub-questions (refined_research_questions has at most 3 items), and a suggested methodology
   (concrete approach, named baselines, metrics, and the data or simulator to use).

Use ONLY the evidence given plus well-established general knowledge; never invent results or
citations. If the evidence is thin, say so and lower `confidence`."""


def analyst_node(state: ResearchState) -> dict:
    # the student's own words, so the Analyst critiques the real idea, not the interviewer's framing
    own_words = "\n".join(f"- {m.content}" for m in state.messages if isinstance(m, HumanMessage)) or f"- {state.idea}"
    adopted = ""
    if state.scope_decision == "adopt":
        adopted = ("NOTE: after your first review the student ADOPTED your refined scope; the brief below now "
                   "reflects it. Assess the ADOPTED scope (mention the original idea only as history).\n\n")
    evidence = (f"{adopted}STUDENT'S ORIGINAL IDEA: {state.idea}\nSTUDENT'S OWN ANSWERS IN THE INTERVIEW:\n{own_words}\n\n"
                f"PROJECT BRIEF (written by the interviewer)\n{_brief_text(state)}\n\n"
                f"JUDGE SUMMARY: {state.judge_summary}\nJUDGE COVERAGE: {state.coverage_score}\n"
                f"JUDGE GAPS: {state.gaps}\n\n"
                f"NUMBERED PAPERS (cite as [n])\n{papers_evidence(state)}\n\n"
                f"USEFUL DATASETS\n{datasets_evidence(state)}")
    emit("analyst", "status", f"Critically analyzing the problem and {len(ref_papers(state))} relevant papers…")
    analysis: ProblemAnalysis = structured(ProblemAnalysis).invoke([SystemMessage(SYSTEM), HumanMessage(evidence)])
    emit("analyst", "thought", f"Problem: {analysis.problem_statement}\n\nPrior work falls into: "
         + "; ".join(t.name for t in analysis.state_of_the_art)
         + "\n\nConcerns:\n" + "\n".join(f"- {c}" for c in analysis.critical_concerns))
    emit("analyst", "decision", f"Topic assessment: {analysis.topic_assessment.replace('_', ' ')} - "
                                f"{analysis.assessment_reasoning}")

    needs_scope_review = analysis.topic_assessment != "well_defined" and not state.scope_reviewed
    return {
        "analysis": analysis,
        "phase": "scope_review" if needs_scope_review else "reporting",
        "log": [{"node": "analyst", "topic_assessment": analysis.topic_assessment,
                 "themes": len(analysis.state_of_the_art), "opportunities": len(analysis.contribution_opportunities),
                 "confidence": analysis.confidence, "papers_cited": len(ref_papers(state))}],
    }
