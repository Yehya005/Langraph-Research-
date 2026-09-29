"""Pydantic models for the LangGraph state and for the agents' structured outputs."""
from __future__ import annotations

import operator
from typing import Annotated, Any, Dict, List, Literal, Optional

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Domain objects
# ---------------------------------------------------------------------------

class ProjectBrief(BaseModel):
    """Everything the Researcher needs to start. Produced by the Interviewer (SOM)."""
    title: str = Field(description="Short working title of the project")
    goal: str = Field(description="What the project is trying to achieve, 1-3 sentences")
    domain: str = Field(description="Field / application domain, e.g. 'healthcare', 'finance'")
    problem_type: str = Field(description="ML/analysis task type, e.g. classification, forecasting, NLP, CV, recommender")
    target_variable: Optional[str] = Field(default=None, description="What should be predicted/measured, if applicable")
    features: List[str] = Field(default_factory=list, description="Input features / data attributes the project needs")
    constraints: List[str] = Field(default_factory=list, description="Constraints: data size, license, region, time range, compute ...")
    research_questions: List[str] = Field(default_factory=list, description="Questions the literature search should answer")
    keywords: List[str] = Field(default_factory=list, description="Search keywords for datasets and papers")


class Dataset(BaseModel):
    id: str  # "kaggle:owner/slug" or "hf:owner/name"
    source: Literal["kaggle", "huggingface"]
    title: str
    url: str
    description: str = ""
    size_bytes: Optional[int] = None
    downloads: Optional[int] = None
    likes: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    found_by_query: str = ""
    research_round: int = 1


class Paper(BaseModel):
    id: str  # "arxiv:2401.01234", "s2:<paperId>" or "upload:<id>"
    source: Literal["arxiv", "semantic_scholar", "upload"]
    title: str
    url: str
    authors: List[str] = Field(default_factory=list)
    year: Optional[int] = None
    abstract: str = ""
    citation_count: Optional[int] = None
    pdf_url: Optional[str] = None
    found_by_query: str = ""
    research_round: int = 1
    local_pdf: Optional[str] = None  # uploaded papers: file name in data/uploads


class Highlight(BaseModel):
    quote: str = Field(description="Short verbatim excerpt from the paper text")
    why_useful: str = Field(description="What this excerpt is useful for in the user's project")


class DatasetVerdict(BaseModel):
    item_id: str = Field(description="The dataset id exactly as given, e.g. 'kaggle:owner/slug'")
    is_valid: bool = Field(description="True if the dataset is real, accessible and usable")
    usefulness: float = Field(ge=0, le=1, description="0 = useless, 1 = perfect fit for the project")
    covered_features: List[str] = Field(default_factory=list, description="Which brief features this dataset covers")
    notes: str = Field(description="Quality, size, license, caveats")
    used_for: str = Field(description="How the project would use this dataset")


class PaperVerdict(BaseModel):
    item_id: str = Field(description="The paper id exactly as given, e.g. 'arxiv:2401.01234'")
    relevance: float = Field(ge=0, le=1, description="0 = unrelated, 1 = directly on topic")
    value_added: str = Field(description="What this paper adds to the project (method, baseline, dataset, insight)")
    key_findings: List[str] = Field(default_factory=list)
    highlights: List[Highlight] = Field(default_factory=list)
    used_for: str = Field(description="Where in the project this paper would be cited / used")
    related_features: List[str] = Field(default_factory=list,
                                        description="Which brief features / research questions this paper informs")


# ---------------------------------------------------------------------------
# Structured outputs (SOM) returned by the agents
# ---------------------------------------------------------------------------

class DraftBrief(BaseModel):
    """What the Interviewer has learned so far (shown live in the interview progress panel)."""
    goal: Optional[str] = Field(default=None, description="Known goal so far, or null")
    domain: Optional[str] = None
    problem_type: Optional[str] = None
    target_variable: Optional[str] = None
    features: List[str] = Field(default_factory=list)
    constraints: List[str] = Field(default_factory=list)
    research_questions: List[str] = Field(default_factory=list)


class InterviewTurn(BaseModel):
    """Structured output of the Interviewer on every turn."""
    reply: str = Field(description="The next message to show the user (a question, or a summary when complete)")
    draft: DraftBrief = Field(default_factory=DraftBrief,
                              description="Everything learned from the user SO FAR (only what they said or clearly implied)")
    brief_complete: bool = Field(description="True only when enough information has been collected to start research")
    brief: Optional[ProjectBrief] = Field(default=None, description="Filled in only when brief_complete is True")


class SearchPlan(BaseModel):
    dataset_queries: List[str] = Field(description="Short search queries for dataset search engines (2-5 words each)")
    paper_queries: List[str] = Field(description="Short search queries for paper search engines")


class VerdictBatch(BaseModel):
    """Structured output of the Judge for one batch of candidates (kept small so the JSON never truncates)."""
    dataset_verdicts: List[DatasetVerdict] = Field(default_factory=list)
    paper_verdicts: List[PaperVerdict] = Field(default_factory=list)


class GapDetail(BaseModel):
    title: str = Field(description="Short name of what is missing")
    feature: Optional[str] = Field(default=None, description="The brief feature or research question it affects, verbatim if possible")
    explanation: str = Field(description="What exactly is missing, 1-2 sentences")
    evidence: str = Field(description="What the collected material shows (or lacks) that reveals this gap")
    why_research: str = Field(description="Why more research here would help the project")


class JudgeReport(BaseModel):
    """Structured output of the Judge's final assessment - drives the conditional edge."""
    gaps: List[GapDetail] = Field(description="What is still missing (uncovered features, unanswered research questions)")
    coverage_score: float = Field(ge=0, le=1, description="How well the found material covers the brief overall")
    needs_more_research: bool = Field(description="True if another research round would clearly help")
    summary: str = Field(description="2-4 sentence overall assessment")


class Theme(BaseModel):
    name: str = Field(description="Name of a line of prior work, e.g. 'Transformer-based classifiers'")
    synthesis: str = Field(description="3-5 sentences synthesizing what this body of work did, what works and what does not, "
                                       "citing papers only as [n]. Never list paper by paper.")
    refs: List[int] = Field(default_factory=list, description="Reference numbers [n] this theme draws on")


class Opportunity(BaseModel):
    title: str
    description: str = Field(description="What exactly the student could contribute, concretely")
    why_open: str = Field(description="Why this is not already solved, grounded in the evidence")
    feasibility: Literal["high", "medium", "low"] = Field(description="For a student project with limited time and compute")
    data_available: bool = Field(description="True if the datasets found can support it")


class ProblemAnalysis(BaseModel):
    """Structured output of the Analyst: critical analysis of the problem and prior work."""
    problem_statement: str = Field(description="The underlying problem in plain words: what goes wrong today and for whom")
    why_it_matters: str = Field(description="Impact / motivation")
    what_people_try_to_fix: List[str] = Field(description="The concrete sub-problems the field is working on")
    state_of_the_art: List[Theme] = Field(description="2-5 themes synthesizing prior work")
    limitations_of_current_work: List[str] = Field(description="Weaknesses, unsolved issues, contradictions across prior work")
    topic_assessment: Literal["well_defined", "too_vague", "too_broad", "infeasible_as_stated", "already_solved"]
    assessment_reasoning: str = Field(description="Honest justification of topic_assessment")
    critical_concerns: List[str] = Field(description="Risky assumptions, data problems, evaluation pitfalls in the user's plan")
    contribution_opportunities: List[Opportunity] = Field(description="2-4 concrete, scoped angles for a contribution")
    refined_scope: str = Field(description="A sharper, feasible 1-2 sentence project scope")
    refined_research_questions: List[str] = Field(description="One core research question plus at most 2 sub-questions")
    suggested_methodology: str = Field(description="How to tackle the refined scope: approach, baselines, evaluation metrics")
    confidence: float = Field(ge=0, le=1, description="Confidence in this analysis given how much evidence was available")


class AssistantReply(BaseModel):
    """Structured output of the chat assistant. `action` asks the system to act through the workflow."""
    reply: str = Field(description="Answer to show the user")
    action: Literal["none", "research", "edit_report", "update_project"] = Field(
        default="none", description="research: find more papers/datasets; edit_report: change the report; "
                                    "update_project: add/remove project features")
    instruction: Optional[str] = Field(default=None, description="For research/edit_report: precise instruction")
    add_features: List[str] = Field(default_factory=list, description="For update_project: features to add")
    remove_features: List[str] = Field(default_factory=list, description="For update_project: features to remove, "
                                                                          "spelled exactly as in the brief")
    add_note: Optional[str] = Field(default=None, description="A new project idea/update to store in the project notes, if the user gave one")


class PaperMeta(BaseModel):
    """Metadata extracted from an uploaded PDF (SOM)."""
    title: str
    authors: List[str] = Field(default_factory=list)
    year: Optional[int] = None
    abstract: str = Field(description="The abstract, or a 3-sentence summary if there is no abstract")


class PaperSummary(BaseModel):
    """Structured summary of one paper (SOM). Use 'Not reported' when the text does not say."""
    objective: str
    methodology: str
    models: List[str] = Field(description="Models / algorithms used")
    datasets: List[str] = Field(description="Datasets used")
    findings: List[str] = Field(description="3-5 major findings")
    limitations: List[str]
    relevance: str = Field(description="How this paper is relevant to the student's project")
    useful_sections: List[str] = Field(description="Sections worth reading for this project, e.g. '4. Experiments - baselines'")


class CompareRow(BaseModel):
    paper_id: str
    objective: str
    methodology: str
    models: str
    datasets: str
    hardware: str
    results: str
    limitations: str
    relevance: str


class PaperComparison(BaseModel):
    """Side-by-side comparison (SOM). Every cell says 'Not reported' when the paper does not state it."""
    rows: List[CompareRow]
    common_ground: List[str] = Field(description="What the papers share (methods, datasets, assumptions)")
    differences: List[str] = Field(description="Key differences and why results may differ")


# ---------------------------------------------------------------------------
# Graph state
# ---------------------------------------------------------------------------

Phase = Literal[
    "interview", "brief_approval", "research", "judging", "more_research_approval",
    "analysis", "scope_review", "reporting", "report_review", "done",
]


class ResearchState(BaseModel):
    # conversation with the interviewer (reducer appends)
    messages: Annotated[List[AnyMessage], add_messages] = Field(default_factory=list)
    idea: str = ""
    phase: Phase = "interview"

    # interviewer
    interview_turns: int = 0
    interview_draft: Optional[DraftBrief] = None
    brief: Optional[ProjectBrief] = None
    brief_approved: bool = False
    user_notes: List[str] = Field(default_factory=list)
    project_changes: List[str] = Field(default_factory=list)  # edits made after research started
    needs_reevaluation: bool = False

    # researcher
    research_round: int = 0
    max_research_rounds: int = 3
    search_queries: List[str] = Field(default_factory=list)
    datasets: List[Dataset] = Field(default_factory=list)
    papers: List[Paper] = Field(default_factory=list)

    # judge
    dataset_verdicts: Dict[str, DatasetVerdict] = Field(default_factory=dict)
    paper_verdicts: Dict[str, PaperVerdict] = Field(default_factory=dict)
    gaps: List[str] = Field(default_factory=list)
    gap_details: List[GapDetail] = Field(default_factory=list)
    coverage_score: Optional[float] = None
    needs_more_research: Optional[bool] = None
    judge_summary: Optional[str] = None
    more_research_approved: Optional[bool] = None

    # analyst
    analysis: Optional[ProblemAnalysis] = None
    scope_reviewed: bool = False
    scope_decision: Optional[Literal["adopt", "keep"]] = None

    # reporter
    report_markdown: Optional[str] = None
    report_version: int = 0
    pending_instruction: Optional[str] = None
    pending_section: Optional[str] = None  # heading of the section an edit should be limited to
    review_action: Optional[Literal["edit", "research_more", "finish"]] = None

    # execution trace (reducer appends) - shows partial updates per node
    log: Annotated[List[Dict[str, Any]], operator.add] = Field(default_factory=list)
