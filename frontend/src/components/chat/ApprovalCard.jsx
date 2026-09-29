import { useState } from "react";
import { Check, ClipboardList, Compass, FileText, Pencil, Search, SquarePen } from "lucide-react";
import { Button } from "../ui/primitives.jsx";
import { navigate, paths } from "../../lib/router.js";
import { pct } from "../../lib/format.js";

const LIST_FIELDS = ["features", "constraints", "research_questions", "keywords"];
const label = (k) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function Frame({ icon: Icon, title, subtitle, children, actions }) {
  return (
    <section className="approval" aria-label={title}>
      <header className="approval__head">
        <span className="approval__icon"><Icon size={16} aria-hidden /></span>
        <div>
          <h3 className="h3">{title}</h3>
          {subtitle && <p className="text-sm subtle">{subtitle}</p>}
        </div>
      </header>
      {children && <div className="approval__body">{children}</div>}
      {actions && <footer className="approval__actions">{actions}</footer>}
    </section>
  );
}

export function BriefApproval({ brief, onDecide, disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(brief);
  const [feedback, setFeedback] = useState("");
  const [askChanges, setAskChanges] = useState(false);
  const set = (k, v) => setDraft({ ...draft, [k]: v });

  return (
    <Frame icon={ClipboardList} title="Research brief ready" subtitle="Check what the research will be based on."
      actions={editing ? (
        <>
          <Button variant="primary" icon={Check} disabled={disabled} onClick={() => onDecide({ approved: true, brief: draft })}>Save & start research</Button>
          <Button variant="ghost" onClick={() => { setEditing(false); setDraft(brief); }}>Cancel</Button>
        </>
      ) : askChanges ? (
        <>
          <Button variant="primary" disabled={!feedback.trim() || disabled} onClick={() => onDecide({ approved: false, feedback })}>Send to interviewer</Button>
          <Button variant="ghost" onClick={() => setAskChanges(false)}>Cancel</Button>
        </>
      ) : (
        <>
          <Button variant="primary" icon={Check} disabled={disabled} onClick={() => onDecide({ approved: true })}>Approve & start research</Button>
          <Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="ghost" onClick={() => setAskChanges(true)}>Request changes</Button>
        </>
      )}>
      {editing ? (
        <div className="form-grid">
          {Object.entries(draft).map(([k, v]) => (
            <label key={k} className="field">
              <span className="field__label">{label(k)}{LIST_FIELDS.includes(k) && <span className="subtle"> · one per line</span>}</span>
              {LIST_FIELDS.includes(k)
                ? <textarea rows={3} value={(v || []).join("\n")} onChange={(e) => set(k, e.target.value.split("\n").filter((x) => x.trim()))} />
                : <input value={v || ""} onChange={(e) => set(k, e.target.value)} />}
            </label>
          ))}
        </div>
      ) : (
        <dl className="kv">
          {["title", "goal", "problem_type", "target_variable", "features", "constraints", "research_questions"].map((k) => (
            <div key={k} className="kv__row">
              <dt>{label(k)}</dt>
              <dd>{Array.isArray(brief[k])
                ? (brief[k].length ? <ul>{brief[k].map((x, i) => <li key={i}>{x}</li>)}</ul> : "—")
                : brief[k] || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      {askChanges && !editing && (
        <label className="field">
          <span className="field__label">What should change?</span>
          <textarea rows={2} value={feedback} autoFocus onChange={(e) => setFeedback(e.target.value)} />
        </label>
      )}
    </Frame>
  );
}

export function MoreResearchApproval({ p, onDecide, disabled }) {
  const [why, setWhy] = useState(false);
  const [focus, setFocus] = useState("");
  return (
    <Frame icon={Search} title="Additional research recommended"
      subtitle={`The Judge estimates coverage at ${pct(p.coverage_score)} after round ${p.round} and found ${p.gaps.length} gap${p.gaps.length === 1 ? "" : "s"}.`}
      actions={
        <>
          <Button variant="primary" icon={Check} disabled={disabled} onClick={() => onDecide({ approved: true, extra_focus: focus || null })}>Approve research</Button>
          <Button disabled={disabled} onClick={() => onDecide({ approved: false })}>Continue without</Button>
          <Button variant="ghost" onClick={() => setWhy(!why)} aria-expanded={why}>{why ? "Hide reason" : "View reason"}</Button>
        </>
      }>
      {why && (
        <div className="stack gap-2">
          {p.summary && <p className="text-sm">{p.summary}</p>}
          <ul className="bullets">{p.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
      )}
      <label className="field">
        <span className="field__label">Anything specific to look for? <span className="subtle">(optional)</span></span>
        <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. datasets recorded outdoors" />
      </label>
    </Frame>
  );
}

const ASSESS = {
  well_defined: "well defined", too_vague: "too vague", too_broad: "too broad",
  infeasible_as_stated: "infeasible as stated", already_solved: "largely already solved",
};

export function ScopeApproval({ p, onDecide, disabled }) {
  return (
    <Frame icon={Compass} title={`The Analyst finds this topic ${ASSESS[p.topic_assessment]}`} subtitle={p.reasoning}
      actions={
        <>
          <Button variant="primary" icon={Check} disabled={disabled} onClick={() => onDecide({ action: "adopt" })}>Adopt refined scope</Button>
          <Button disabled={disabled} onClick={() => onDecide({ action: "keep" })}>Keep my scope</Button>
        </>
      }>
      {p.concerns?.length > 0 && (
        <div className="stack gap-1">
          <span className="eyebrow">Concerns</span>
          <ul className="bullets">{p.concerns.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      <div className="callout">
        <span className="eyebrow">Suggested scope</span>
        <p>{p.refined_scope}</p>
        <ul className="bullets">{p.refined_research_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
      </div>
    </Frame>
  );
}

export function ReportApproval({ onDecide, disabled, version }) {
  return (
    <Frame icon={FileText} title={`Report ready${version ? ` · version ${version}` : ""}`}
      subtitle="Read it, ask for changes section by section, or mark the project as complete."
      actions={
        <>
          <Button variant="primary" icon={SquarePen} onClick={() => navigate(paths.report())}>Open report</Button>
          <Button disabled={disabled} onClick={() => onDecide({ action: "finish" })}>Mark complete</Button>
        </>
      } />
  );
}
