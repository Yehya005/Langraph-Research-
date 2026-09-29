/** Derived research data shared by the Library, Evidence Map, Gaps and chat summaries. */

// The Judge scores every source 0-1 (usefulness for datasets, relevance for papers).
// The UI groups those scores into three statuses; the thresholds are shown to the user in tooltips.
export const STATUS = {
  accepted: { label: "Accepted", tone: "success", hint: "Judge score of 70% or higher" },
  review: { label: "Needs review", tone: "warning", hint: "Judge score between 40% and 69%" },
  rejected: { label: "Rejected", tone: "danger", hint: "Judge score below 40%, or judged not valid/usable" },
  pending: { label: "Not evaluated", tone: "neutral", hint: "The Judge has not evaluated this source yet" },
};

export function statusFromScore(score, valid = true) {
  if (score == null) return "pending";
  if (!valid || score < 0.4) return "rejected";
  return score >= 0.7 ? "accepted" : "review";
}

export const paperStatus = (v) => statusFromScore(v?.relevance);
export const datasetStatus = (v) => statusFromScore(v?.usefulness, v ? v.is_valid : true);

export const SOURCE_LABEL = {
  arxiv: "arXiv", semantic_scholar: "Semantic Scholar", upload: "Uploaded",
  kaggle: "Kaggle", huggingface: "Hugging Face",
};

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Does a tag produced by the Judge refer to this brief feature? (exact or containment match) */
export function sameFeature(tag, feature) {
  const a = norm(tag), b = norm(feature);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

export function removedFeatures(state) {
  return (state.project_changes || [])
    .filter((c) => c.startsWith("Removed feature: "))
    .map((c) => c.slice("Removed feature: ".length))
    .filter((f) => !(state.brief?.features || []).some((x) => sameFeature(x, f)));
}

export function referenceNumbers(state) {
  const map = {};
  (state.references || []).forEach((id, i) => { map[id] = i + 1; });
  return map;
}

export function gapsOf(state) {
  if (state.gap_details?.length) return state.gap_details;
  return (state.gaps || []).map((g) => {
    const [title, ...rest] = g.split(": ");
    return { title, feature: null, explanation: rest.join(": ") || g, evidence: "", why_research: "" };
  });
}

/** Which workflow step can run more research right now, if any (used by "Research this gap"). */
export function researchAction(view) {
  if (!view || view.running) return null;
  const p = view.pending?.type;
  if (p === "approve_more_research") return (text) => ({ approved: true, extra_focus: text });
  if (p === "report_review" || view.state.phase === "done") return (text) => ({ action: "research_more", instruction: text });
  return null;
}

export function researchUnavailableReason(view) {
  if (!view) return "";
  if (view.running) return "The team is working on the current step.";
  const p = view.pending?.type;
  if (p === "question" || p === "approve_brief") return "Finish the interview and approve the brief first.";
  if (p === "approve_scope") return "Decide on the refined scope first.";
  return "Research can be extended once the Judge has evaluated the first results.";
}
