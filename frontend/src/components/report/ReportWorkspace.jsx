import { useEffect, useMemo, useState } from "react";
import { ArrowUp, Download, FileText, Pencil, RotateCcw, Sparkles, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { useSession } from "../../lib/session.jsx";
import { navigate, paths } from "../../lib/router.js";
import { clock } from "../../lib/format.js";
import { Button, EmptyState, Markdown, Menu, MenuItem, Select, Spinner } from "../ui/primitives.jsx";
import Workspace from "../layout/Workspace.jsx";

/** Split the report at "## " headings, keeping each heading with its content. */
function sections(md) {
  return md.split(/^(?=## )/m).filter(Boolean).map((chunk) => ({
    heading: chunk.startsWith("## ") ? chunk.split("\n")[0].replace(/^##\s*/, "") : null,
    body: chunk,
  }));
}

const SUGGESTIONS = {
  section: ["Rewrite this section more academically", "Make this section shorter", "Expand this section with more detail", "Simplify the language"],
  report: ["Shorten the introduction", "Make the tone more academic", "Add an executive summary at the top", "Expand the dataset discussion"],
};

function ReportAssistant({ target, onClearTarget, canEdit, reason }) {
  const { view, state, actions, events } = useSession();
  const [text, setText] = useState("");
  const edits = state.log.filter((l) => l.node === "report_editor" || l.node === "report_manual" || l.node === "report_revert").slice(-6).reverse();
  const live = view.running ? [...events].reverse().find((e) => e.run === view.run && (e.kind === "status" || e.kind === "decision")) : null;

  const send = (instruction) => {
    if (!instruction.trim() || !canEdit) return;
    actions.resume({ action: "edit", instruction, section: target || null }).catch(() => {});
    setText("");
  };

  return (
    <div className="report-ai">
      <div className="report-ai__target">
        <span className="eyebrow">Editing</span>
        {target ? (
          <span className="chip">{target}<button type="button" aria-label="Edit the whole report instead" onClick={onClearTarget}><X size={12} /></button></span>
        ) : <span className="text-sm">Whole report <span className="subtle">· or pick a section in the document</span></span>}
      </div>
      {view.running ? (
        <p className="row gap-2 text-sm subtle"><Spinner /> {live?.text || "The Reporter is revising the report…"}</p>
      ) : !canEdit ? (
        <p className="text-sm subtle">{reason}</p>
      ) : (
        <div className="source-chat__suggest">
          {SUGGESTIONS[target ? "section" : "report"].map((s) => <button key={s} type="button" className="suggestion" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}
      <form className="source-chat__composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label className="sr-only" htmlFor="report-instruction">Edit instruction</label>
        <textarea id="report-instruction" rows={3} value={text} disabled={!canEdit || view.running}
          placeholder={target ? `How should "${target}" change?` : "e.g. Add Paper 7 to the related work"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} />
        <Button type="submit" variant="primary" icon={ArrowUp} aria-label="Apply edit" disabled={!canEdit || view.running || !text.trim()} />
      </form>
      {edits.length > 0 && (
        <div className="stack gap-1">
          <span className="eyebrow">Recent changes</span>
          <ul className="edits">
            {edits.map((l, i) => (
              <li key={i} className="text-xs">
                v{l.report_version} · {l.node === "report_manual" ? "manual edit" : l.node === "report_revert" ? `restored v${l.from_version}` : l.section ? l.section.replace(/^#+\s*/, "") : "whole report"}
                {l.ts && <span className="subtle"> · {clock(l.ts)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ReportWorkspace({ panelOpen, onClosePanel }) {
  const { view, state, actions, busy } = useSession();
  const [target, setTarget] = useState(null);
  const [manual, setManual] = useState(null);
  const [viewing, setViewing] = useState("current");
  const [old, setOld] = useState(null);
  const versions = view.extras?.report_versions || [];
  const refs = state.references || [];
  const openRef = (n) => refs[n - 1] && navigate(paths.paper(refs[n - 1]));

  useEffect(() => {
    if (viewing === "current") { setOld(null); return; }
    api.reportVersion(view.thread_id, Number(viewing)).then(setOld).catch(() => setViewing("current"));
  }, [viewing, view.thread_id]);
  useEffect(() => { setViewing("current"); }, [state.report_version]);

  const pending = view.pending?.type;
  const canEdit = !view.running && (pending === "report_review" || state.phase === "done");
  const reason = view.running ? "" : "The report can be edited once it has been written and is waiting for review.";
  const md = old ? old.markdown : state.report_markdown || "";
  const parts = useMemo(() => sections(md), [md]);

  if (!state.report_markdown) {
    return (
      <Workspace open={false}>
        <div className="page page--narrow">
          <EmptyState icon={FileText} title="No report yet" actions={<Button onClick={() => navigate(paths.chat())}>Go to chat</Button>}>
            The Reporter writes the report after the Judge and the Analyst finish. You can then edit it here section by section.
          </EmptyState>
        </div>
      </Workspace>
    );
  }

  const saveManual = async () => { try { await actions.saveReport(manual); setManual(null); } catch { /* shown globally */ } };

  return (
    <Workspace open={panelOpen} onClose={onClosePanel} panelTitle="Edit with AI"
      panel={<ReportAssistant target={target} onClearTarget={() => setTarget(null)} canEdit={canEdit} reason={reason} />}>
      <div className="page page--report">
        <div className="doc-toolbar">
          <Select label="Version" value={viewing} onChange={setViewing} options={[
            { value: "current", label: `Current · v${state.report_version}` },
            ...versions.filter((v) => v.version !== state.report_version).slice().reverse()
              .map((v) => ({ value: String(v.version), label: `v${v.version} · ${clock(v.ts)}` })),
          ]} />
          {old && <Button size="sm" icon={RotateCcw} disabled={view.running || !!busy}
            onClick={() => actions.revertReport(old.version).then(() => setViewing("current")).catch(() => {})}>Restore v{old.version}</Button>}
          <span className="doc-toolbar__spacer" />
          {!old && manual == null && <Button size="sm" variant="ghost" icon={Pencil} disabled={view.running} onClick={() => setManual(state.report_markdown)}>Edit manually</Button>}
          <Menu label="Export" icon={Download} size="sm">
            <MenuItem href={api.reportUrl(view.thread_id, "pdf")} download>PDF document</MenuItem>
            <MenuItem href={api.reportUrl(view.thread_id, "docx")} download>Word document (.docx)</MenuItem>
            <MenuItem href={api.reportUrl(view.thread_id, "md")} download>Markdown</MenuItem>
            <MenuItem href={api.reportUrl(view.thread_id, "bib")} download>References (BibTeX)</MenuItem>
          </Menu>
        </div>

        {old && <p className="notice">You're viewing version {old.version}. Restore it to make it current.</p>}

        {manual != null ? (
          <div className="stack gap-2">
            <label className="sr-only" htmlFor="manual-report">Report markdown</label>
            <textarea id="manual-report" className="doc-editor" value={manual} onChange={(e) => setManual(e.target.value)} />
            <div className="row gap-2">
              <Button variant="primary" disabled={!!busy} onClick={saveManual}>Save as new version</Button>
              <Button variant="ghost" onClick={() => setManual(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <article className="doc">
            {parts.map((s, i) => (
              <section key={i} className={`doc__section ${target && s.heading === target ? "is-target" : ""}`}>
                {s.heading && !old && !s.heading.startsWith("References") && (
                  <Button size="sm" variant="ghost" icon={Sparkles} className="doc__edit"
                    onClick={() => { setTarget(s.heading); actions.closeSource(); }}>Edit with AI</Button>
                )}
                <Markdown onCite={openRef}>{s.body}</Markdown>
              </section>
            ))}
          </article>
        )}
      </div>
    </Workspace>
  );
}
