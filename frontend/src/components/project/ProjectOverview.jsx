import { useState } from "react";
import { Check, Pencil, TriangleAlert } from "lucide-react";
import { useSession } from "../../lib/session.jsx";
import { navigate, paths } from "../../lib/router.js";
import { researchAction, researchUnavailableReason } from "../../lib/research.js";
import { pct, plural } from "../../lib/format.js";
import { Button, EmptyState, Markdown, Tag } from "../ui/primitives.jsx";
import Workspace from "../layout/Workspace.jsx";

const FIELDS = [
  ["title", "Title"], ["goal", "Goal"], ["domain", "Domain"], ["problem_type", "Task type"], ["target_variable", "Target / outcome"],
  ["features", "Features"], ["constraints", "Constraints"], ["research_questions", "Research questions"], ["keywords", "Search keywords"],
];
const LISTS = ["features", "constraints", "research_questions", "keywords"];
const ASSESS = {
  well_defined: ["success", "Well-defined topic"], too_vague: ["warning", "Topic too vague"], too_broad: ["warning", "Topic too broad"],
  infeasible_as_stated: ["danger", "Infeasible as stated"], already_solved: ["danger", "Largely already solved"],
};

function BriefEditor({ brief, onSave, onCancel, saving }) {
  const [draft, setDraft] = useState(brief);
  return (
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
      {FIELDS.map(([k, label]) => (
        <label key={k} className="field">
          <span className="field__label">{label}{LISTS.includes(k) && <span className="subtle"> · one per line</span>}</span>
          {LISTS.includes(k)
            ? <textarea rows={Math.max(2, (draft[k] || []).length)} value={(draft[k] || []).join("\n")}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value.split("\n").filter((x) => x.trim()) })} />
            : <input value={draft[k] || ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />}
        </label>
      ))}
      <div className="row gap-2">
        <Button type="submit" variant="primary" icon={Check} disabled={saving}>Save changes</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export default function ProjectOverview({ panelOpen, onClosePanel }) {
  const { view, state, actions, busy } = useSession();
  const [editing, setEditing] = useState(false);
  const brief = state.brief;
  const a = state.analysis;
  const act = researchAction(view);
  const refs = state.references || [];
  const openRef = (n) => refs[n - 1] && navigate(paths.paper(refs[n - 1]));
  const briefPending = view.pending?.type === "approve_brief";

  const save = async (draft) => { try { await actions.updateBrief(draft); setEditing(false); } catch { /* shown globally */ } };
  const researchChanges = () => actions.resume(act(`Re-evaluate the research after these project changes: ${state.project_changes.join("; ")}`))
    .then(() => navigate(paths.chat())).catch(() => {});

  if (!brief) {
    return <Workspace open={false}><div className="page page--narrow"><EmptyState title="The brief isn't ready yet"
      actions={<Button onClick={() => navigate(paths.chat())}>Continue the interview</Button>}>
      The project overview fills in once the interviewer has drafted your research brief.</EmptyState></div></Workspace>;
  }

  return (
    <Workspace open={panelOpen} onClose={onClosePanel}>
      <div className="page page--narrow">
        <header className="page__header">
          <div>
            <span className="eyebrow">Project overview</span>
            <h2 className="h1">{brief.title}</h2>
          </div>
          {!editing && (
            <Button icon={Pencil} disabled={view.running || briefPending}
              title={briefPending ? "Edit the brief in the approval card in chat" : view.running ? "Wait for the current step" : undefined}
              onClick={() => setEditing(true)}>Edit project</Button>
          )}
        </header>

        {state.needs_reevaluation && (
          <div className="callout callout--warning" role="status">
            <div className="row gap-2"><TriangleAlert size={16} aria-hidden /><strong>Research may need re-evaluation</strong></div>
            <p className="text-sm">The project changed after research ran: {state.project_changes.slice(-5).join("; ")}.
              Existing papers and datasets were judged against the previous version.</p>
            <div className="row gap-2">
              <Button size="sm" variant="primary" disabled={!act} title={act ? undefined : researchUnavailableReason(view)} onClick={researchChanges}>
                Research the changes
              </Button>
              {!act && <span className="text-xs subtle">{researchUnavailableReason(view)}</span>}
            </div>
          </div>
        )}

        <section className="card">
          {editing ? <BriefEditor brief={brief} saving={!!busy} onSave={save} onCancel={() => setEditing(false)} /> : (
            <dl className="kv">
              {FIELDS.slice(1).map(([k, label]) => (
                <div key={k} className="kv__row">
                  <dt>{label}</dt>
                  <dd>{LISTS.includes(k)
                    ? (brief[k]?.length ? (k === "features" || k === "keywords"
                      ? <div className="row gap-1 wrap">{brief[k].map((x) => <Tag key={x}>{x}</Tag>)}</div>
                      : <ul className="bullets">{brief[k].map((x, i) => <li key={i}>{x}</li>)}</ul>) : "—")
                    : brief[k] || "—"}</dd>
                </div>
              ))}
              {state.user_notes?.length > 0 && (
                <div className="kv__row"><dt>Your notes</dt><dd><ul className="bullets">{state.user_notes.map((n, i) => <li key={i}>{n}</li>)}</ul></dd></div>
              )}
            </dl>
          )}
        </section>

        <dl className="stats">
          <div><dt>Research rounds</dt><dd>{state.research_round}</dd></div>
          <div><dt>Papers</dt><dd>{state.papers.length}</dd></div>
          <div><dt>Datasets</dt><dd>{state.datasets.length}</dd></div>
          <div><dt>Judge coverage</dt><dd>{pct(state.coverage_score)}</dd></div>
        </dl>

        {a ? (
          <>
            <section className="stack gap-2">
              <div className="row gap-2">
                <h3 className="h2">Critical assessment</h3>
                <span className={`badge badge--${ASSESS[a.topic_assessment][0]}`}>{ASSESS[a.topic_assessment][1]}</span>
                <span className="text-xs subtle">Analyst confidence {pct(a.confidence)}</span>
              </div>
              <p>{a.assessment_reasoning}</p>
              {a.critical_concerns.length > 0 && <ul className="bullets">{a.critical_concerns.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            </section>
            <section className="stack gap-2">
              <h3 className="h2">The problem</h3>
              <p>{a.problem_statement}</p>
              <p className="subtle">{a.why_it_matters}</p>
              <span className="eyebrow">What people are trying to fix</span>
              <ul className="bullets">{a.what_people_try_to_fix.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
            <section className="stack gap-3">
              <h3 className="h2">What has been done so far</h3>
              {a.state_of_the_art.map((t, i) => (
                <div key={i} className="theme"><h4 className="h3">{t.name}</h4><Markdown onCite={openRef}>{t.synthesis}</Markdown></div>
              ))}
            </section>
            <section className="stack gap-2">
              <h3 className="h2">Recommended direction</h3>
              <p className="callout"><strong>{a.refined_scope}</strong></p>
              <ul className="bullets">{a.refined_research_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              <p><span className="eyebrow">Methodology</span><br />{a.suggested_methodology}</p>
              <Button variant="ghost" size="sm" onClick={() => navigate(paths.gaps())}>
                {plural(a.contribution_opportunities.length, "contribution angle")} in Research gaps
              </Button>
            </section>
          </>
        ) : (
          <p className="subtle text-sm">The Analyst's critical assessment appears after the Judge evaluates the research.</p>
        )}
      </div>
    </Workspace>
  );
}
