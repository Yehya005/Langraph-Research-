import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "../../lib/api.js";
import { useSession } from "../../lib/session.jsx";
import { clock, pct } from "../../lib/format.js";
import { EmptyState } from "../ui/primitives.jsx";
import Workspace from "../layout/Workspace.jsx";

const ASSESS = { well_defined: "well defined", too_vague: "too vague", too_broad: "too broad", infeasible_as_stated: "infeasible as stated", already_solved: "largely already solved" };

/** Turn the graph's own node log into project milestones (skipping chatty interview turns). */
function describe(l) {
  switch (l.node) {
    case "interviewer": return l.brief_complete ? ["Research brief drafted", "The interviewer summarized the project."] : null;
    case "approve_brief": return l.approved ? ["Research brief approved"] : ["Brief sent back for changes"];
    case "researcher": return [`Research round ${l.round}`, `${l.new_papers} new papers and ${l.new_datasets} new datasets from ${l.tool_calls} searches`];
    case "judge": return ["Judge evaluation completed", `${l.judged ?? "All"} sources scored · coverage ${pct(l.coverage)} · ${l.gaps} gaps${l.failed ? ` · ${l.failed} could not be scored` : ""}`];
    case "approve_more_research": return [l.approved ? "Additional research approved" : "Continued without additional research"];
    case "analyst": return ["Critical analysis completed", `Topic assessed as ${ASSESS[l.topic_assessment] || l.topic_assessment} · ${l.opportunities} contribution angles`];
    case "approve_scope": return [l.action === "adopt" ? "Refined scope adopted" : "Original scope kept"];
    case "reporter": return [`Report v${l.report_version} generated`];
    case "report_editor": return [`Report edited (v${l.report_version})`, l.section ? `Section: ${l.section.replace(/^#+\s*/, "")}` : "Whole report revised"];
    case "report_manual": return [`Report edited manually (v${l.report_version})`];
    case "report_revert": return [`Report restored from v${l.from_version} (now v${l.report_version})`];
    case "report_review": return l.action === "finish" ? ["Project marked complete"] : l.action === "research_more" ? ["More research requested from the report"] : null;
    case "project_edit": return ["Project modified", (l.changes || []).join("; ")];
    case "upload": return ["Paper uploaded", l.title];
    case "judge_upload": return ["Judge evaluated an uploaded paper", `${l.title} · relevance ${pct(l.relevance)}`];
    default: return null;
  }
}

function DeveloperDetails({ view }) {
  const [hist, setHist] = useState([]);
  useEffect(() => { api.history(view.thread_id).then(setHist).catch(() => {}); }, [view.thread_id, view.state.log.length]);
  return (
    <details className="card dev">
      <summary><strong>Developer details</strong> <span className="text-xs subtle">LangGraph checkpoints and raw node log</span></summary>
      <h4 className="h3">MemorySaver checkpoints (newest first)</h4>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Step</th><th>Next</th><th>Phase</th><th>Round</th><th>Papers</th><th>Datasets</th><th>Verdicts</th><th>Coverage</th><th>Report</th></tr></thead>
          <tbody>{hist.map((h) => (
            <tr key={h.checkpoint_id}><td>{h.step}</td><td>{h.next.join(", ") || "—"}</td><td>{h.phase}</td><td>{h.research_round}</td>
              <td>{h.papers}</td><td>{h.datasets}</td><td>{h.verdicts}</td><td>{pct(h.coverage_score)}</td><td>{h.report_version}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <h4 className="h3">Node log (partial state updates)</h4>
      <ol className="raw-log">{view.state.log.map((l, i) => <li key={i}><code>{JSON.stringify(l)}</code></li>)}</ol>
    </details>
  );
}

export default function HistoryTimeline({ panelOpen, onClosePanel }) {
  const { view, state } = useSession();
  const items = [{ title: "Project started", detail: state.idea, ts: state.log[0]?.ts }];
  state.log.forEach((l) => { const d = describe(l); if (d) items.push({ title: d[0], detail: d[1], ts: l.ts }); });

  return (
    <Workspace open={panelOpen} onClose={onClosePanel}>
      <div className="page page--narrow">
        <header className="page__header">
          <div>
            <h2 className="h1">History</h2>
            <p className="subtle text-sm">Milestones of this project, newest last.</p>
          </div>
        </header>
        {items.length <= 1 ? <EmptyState icon={History} title="Nothing has happened yet" /> : (
          <ol className="timeline">
            {items.map((it, i) => (
              <li key={i} className="timeline__item">
                <span className="timeline__dot" aria-hidden />
                <div>
                  <div className="row gap-2"><strong className="text-sm">{it.title}</strong>{it.ts && <span className="text-xs subtle">{clock(it.ts)}</span>}</div>
                  {it.detail && <p className="text-sm subtle">{it.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
        <DeveloperDetails view={view} />
      </div>
    </Workspace>
  );
}
