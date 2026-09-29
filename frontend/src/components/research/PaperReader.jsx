import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, FileText, MessageCircleQuestion, RefreshCw, ScrollText, Scale, Sparkles } from "lucide-react";
import { api } from "../../lib/api.js";
import { useSession } from "../../lib/session.jsx";
import { navigate, paths } from "../../lib/router.js";
import { paperStatus, SOURCE_LABEL } from "../../lib/research.js";
import { authorsShort, pct } from "../../lib/format.js";
import { Button, EmptyState, ErrorState, LinkButton, LoadingState, StatusBadge, Tabs, Tag } from "../ui/primitives.jsx";
import Workspace from "../layout/Workspace.jsx";
import SourceChat from "./SourceChat.jsx";
import PaperSummary from "./PaperSummary.jsx";

function SelectionMenu({ box, onAction }) {
  if (!box) return null;
  return (
    <div className="selection-menu" style={{ top: box.top, left: box.left }} role="toolbar" aria-label="Selected text actions"
      onMouseDown={(e) => e.preventDefault()}>
      <button type="button" onClick={() => onAction("explain")}><Sparkles size={13} aria-hidden /> Explain</button>
      <button type="button" onClick={() => onAction("summarize")}><ScrollText size={13} aria-hidden /> Summarize</button>
      <button type="button" onClick={() => onAction("ask")}><MessageCircleQuestion size={13} aria-hidden /> Ask AI</button>
    </div>
  );
}

function Reader({ doc, pdfUrl, onSelect }) {
  const [mode, setMode] = useState("text");
  const [box, setBox] = useState(null);
  const area = useRef(null);
  const selection = useRef("");

  const onMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || "";
    if (text.length < 4 || !area.current?.contains(sel.anchorNode)) { setBox(null); return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const a = area.current.getBoundingClientRect();
    selection.current = text;
    setBox({ top: r.top - a.top + area.current.scrollTop - 40, left: Math.max(0, r.left - a.left + r.width / 2 - 120) });
  };
  const act = (kind) => { onSelect(kind, selection.current); setBox(null); window.getSelection()?.removeAllRanges(); };

  if (!doc.full_text) {
    return (
      <div className="reader__notice">
        <EmptyState icon={FileText} title="The full text isn't available here"
          actions={doc.source_url && <LinkButton variant="primary" icon={ExternalLink} href={doc.source_url} target="_blank" rel="noreferrer">Open original source</LinkButton>}>
          {doc.note || "No open-access PDF is known for this paper."} The abstract is shown below, and the assistant answers from it.
        </EmptyState>
        {doc.pages[0] && <article className="reader__text"><p>{doc.pages[0]}</p></article>}
      </div>
    );
  }
  return (
    <div className="reader">
      <div className="reader__bar">
        <Tabs value={mode} onChange={setMode} tabs={[{ id: "text", label: "Text" }, { id: "pdf", label: "Original PDF" }]} />
        {mode === "text" && <span className="text-xs subtle">Select any passage to explain, summarize or ask about it.</span>}
      </div>
      {mode === "text" ? (
        <div className="reader__scroll" ref={area} onMouseUp={onMouseUp}>
          <SelectionMenu box={box} onAction={act} />
          <article className="reader__text">
            {doc.pages.map((pg, i) => (
              <section key={i} className="reader__page" aria-label={`Page ${i + 1}`}>
                <span className="reader__pageno">Page {i + 1}</span>
                {pg.split(/\n{2,}|(?<=[.!?:])\n(?=[A-Z0-9])/).map((para, j) => <p key={j}>{para.replace(/\n/g, " ")}</p>)}
              </section>
            ))}
          </article>
        </div>
      ) : (
        <iframe className="reader__pdf" src={pdfUrl} title="Original PDF" />
      )}
    </div>
  );
}

function JudgeVerdict({ paper, verdict, onEvaluate, evaluating }) {
  if (!verdict) {
    return (
      <EmptyState icon={Scale} title="Not evaluated yet"
        actions={<Button variant="primary" onClick={onEvaluate} disabled={evaluating}>{evaluating ? "Evaluating…" : "Ask the Judge to evaluate"}</Button>}>
        The Judge scores relevance to your project and extracts evidence from the paper.
      </EmptyState>
    );
  }
  return (
    <div className="stack gap-4 prose-block">
      <div className="row gap-3"><StatusBadge status={paperStatus(verdict)} /><span className="text-sm">Relevance {pct(verdict.relevance)}</span></div>
      <div><h3 className="h3">What it adds</h3><p>{verdict.value_added}</p></div>
      <div><h3 className="h3">Where it would be used</h3><p>{verdict.used_for}</p></div>
      {verdict.key_findings?.length > 0 && <div><h3 className="h3">Key findings</h3><ul className="bullets">{verdict.key_findings.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
      {verdict.highlights?.length > 0 && (
        <div><h3 className="h3">Quoted evidence</h3>
          {verdict.highlights.map((h, i) => <blockquote key={i} className="quote"><p>“{h.quote}”</p><footer>{h.why_useful}</footer></blockquote>)}
        </div>
      )}
      {verdict.related_features?.length > 0 && <div className="row gap-1 wrap">{verdict.related_features.map((f) => <Tag key={f}>{f}</Tag>)}</div>}
      <p className="text-xs subtle">Found by: {paper.found_by_query || "—"} · research round {paper.research_round}</p>
    </div>
  );
}

export default function PaperReader({ paperId, tab = "read", panelOpen, onClosePanel }) {
  const { view, state, actions } = useSession();
  const paper = state.papers.find((p) => p.id === paperId);
  const verdict = state.paper_verdicts[paperId];
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [evaluating, setEvaluating] = useState(false);

  const load = () => {
    setDoc(null); setErr(null);
    api.paperText(view.thread_id, paperId).then(setDoc).catch((e) => setErr(e.message));
  };
  useEffect(() => { if (paper && tab === "read") load(); }, [paperId, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { actions.closeSource(); }, [paperId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!paper) {
    return <Workspace open={false}><div className="page"><EmptyState icon={FileText} title="Paper not found"
      actions={<Button onClick={() => navigate(paths.library("papers"))}>Back to library</Button>}>It may belong to another project.</EmptyState></div></Workspace>;
  }

  const onSelect = (kind, text) => {
    if (kind === "ask") setAttachment({ selection: text, n: Date.now() });
    else setPrompt({ message: kind === "explain" ? "Explain this passage in plain terms." : "Summarize this passage.", selection: text, n: Date.now() });
  };
  const evaluate = async () => { setEvaluating(true); try { await actions.evaluate(paperId); } catch { /* shown globally */ } setEvaluating(false); };
  const src = { kind: "paper", ids: [paperId], title: null };

  return (
    <Workspace open={panelOpen} onClose={onClosePanel} panelTitle="Research assistant"
      panel={<SourceChat source={src} prompt={prompt} attachment={attachment} />}>
      <div className="page page--reader">
        <header className="paper-head">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate(paths.library("papers"))}>Library</Button>
          <h2 className="paper-head__title">{paper.title}</h2>
          <p className="paper-head__meta">
            {authorsShort(paper.authors)}{paper.year ? ` · ${paper.year}` : ""} · {SOURCE_LABEL[paper.source]}
            {paper.citation_count != null && ` · ${paper.citation_count} citations`}
          </p>
          <div className="row gap-2 wrap">
            <StatusBadge status={paperStatus(verdict)} />
            {paper.url && <LinkButton size="sm" variant="ghost" icon={ExternalLink} href={paper.url} target="_blank" rel="noreferrer">Original source</LinkButton>}
            {paper.source === "upload" && verdict && <Button size="sm" variant="ghost" icon={RefreshCw} onClick={evaluate} disabled={evaluating}>Re-evaluate</Button>}
          </div>
        </header>
        <Tabs value={tab} onChange={(t) => navigate(paths.paper(paperId, t === "read" ? null : t))} tabs={[
          { id: "read", label: "Read", icon: FileText }, { id: "summary", label: "Summary", icon: ScrollText },
          { id: "judge", label: "Judge's verdict", icon: Scale }]} />
        <div className="paper-body">
          {tab === "read" && (err ? <ErrorState title="We couldn't load this paper" message={err} onRetry={load}>
              {paper.url && <LinkButton size="sm" href={paper.url} target="_blank" rel="noreferrer" icon={ExternalLink}>Open original source</LinkButton>}
            </ErrorState>
            : !doc ? <LoadingState label="Retrieving the paper from its source…" lines={6} />
            : <Reader doc={doc} pdfUrl={api.paperPdfUrl(view.thread_id, paperId)} onSelect={onSelect} />)}
          {tab === "summary" && <PaperSummary paperId={paperId} />}
          {tab === "judge" && <JudgeVerdict paper={paper} verdict={verdict} onEvaluate={evaluate} evaluating={evaluating} />}
        </div>
      </div>
    </Workspace>
  );
}
