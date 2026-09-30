import { useEffect, useMemo, useRef } from "react";
import { ArrowRight, BookOpenText, CircleCheck, FileText } from "lucide-react";
import { useSession } from "../../lib/session.jsx";
import { useUpload } from "../../lib/useUpload.js";
import { navigate, paths } from "../../lib/router.js";
import { ago, pct, plural } from "../../lib/format.js";
import { gapsOf, paperStatus } from "../../lib/research.js";
import { Button, ErrorState, Markdown, Spinner } from "../ui/primitives.jsx";
import Workspace from "../layout/Workspace.jsx";
import ChatComposer from "./ChatComposer.jsx";
import RunSummary from "./RunSummary.jsx";
import InterviewProgress from "./InterviewProgress.jsx";
import { BriefApproval, MoreResearchApproval, ReportApproval, ScopeApproval } from "./ApprovalCard.jsx";

const EXAMPLES = [
  "Evaluating retrieval-augmented generation for reducing hallucinations in healthcare chatbots",
  "Detecting fake news articles with NLP",
  "Sentiment analysis of Lebanese Arabic (Arabizi) tweets",
];
const INTERVIEW_QUICK = ["Skip this question", "I'm not sure, suggest some options", "That's all, please finish the brief"];

function Message({ role, label, children }) {
  return (
    <div className={`msg msg--${role}`}>
      {role === "assistant" && label && <span className="agent-label">{label}</span>}
      <div className="msg__body"><Markdown>{String(children)}</Markdown></div>
    </div>
  );
}

function StartScreen() {
  const { projects, actions, busy, error } = useSession();
  return (
    <div className="start">
      <div className="start__intro">
        <div className="start__mark"><BookOpenText size={25} aria-hidden /></div>
        <h2 className="h1">What would you like to research?</h2>
        <p className="subtle">Describe a project idea. The assistant interviews you, searches papers and datasets,
          evaluates them critically and writes a report you can refine.</p>
      </div>
      <ChatComposer placeholder="Describe your project idea…" onSend={(t) => actions.create(t)} disabled={!!busy} autoFocus />
      {busy && <p className="text-sm subtle row gap-2"><Spinner /> {busy}</p>}
      {error && <ErrorState title="Could not start the project" message={error} />}
      <div className="start__examples">
        {EXAMPLES.map((e) => <button key={e} type="button" className="suggestion" onClick={() => actions.create(e)} disabled={!!busy}>{e}</button>)}
      </div>
      {projects.length > 0 && (
        <section className="start__recent">
          <h3 className="eyebrow">Continue a project</h3>
          <ul className="list">
            {projects.slice(0, 4).map((p) => (
              <li key={p.id}>
                <button type="button" className="list__row" onClick={() => actions.open(p.id)}>
                  <FileText size={16} aria-hidden />
                  <span className="list__title">{p.title || p.idea}</span>
                  <span className="list__meta">{plural(p.counts?.papers ?? 0, "paper")} · {ago(p.updated_at)}</span>
                  <ArrowRight size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ResearchProgress({ state, view }) {
  const accepted = state.papers.filter((p) => paperStatus(state.paper_verdicts[p.id]) === "accepted").length;
  const stages = [
    ["Interview", state.brief_approved],
    [`Research${state.research_round ? ` · ${plural(state.research_round, "round")}` : ""}`, state.research_round > 0],
    ["Evaluation", state.coverage_score != null],
    ["Analysis", !!state.analysis],
    [`Report${state.report_version ? ` · v${state.report_version}` : ""}`, state.report_version > 0],
  ];
  const current = stages.findIndex(([, done]) => !done);
  return (
    <div className="stack gap-4">
      <ol className="stages">
        {stages.map(([name, done], i) => (
          <li key={name} className={done ? "is-done" : i === current ? (view.running ? "is-active" : "is-next") : ""}>
            {done ? <CircleCheck size={15} aria-hidden /> : i === current && view.running ? <Spinner size={15} /> : <span className="stages__dot" />}
            {name}
          </li>
        ))}
      </ol>
      <dl className="stats">
        <div><dt>Papers</dt><dd>{state.papers.length}</dd></div>
        <div><dt>Accepted</dt><dd>{accepted}</dd></div>
        <div><dt>Datasets</dt><dd>{state.datasets.length}</dd></div>
        <div><dt>Coverage</dt><dd>{pct(state.coverage_score)}</dd></div>
      </dl>
      {state.needs_reevaluation && (
        <div className="callout callout--warning">
          <strong className="text-sm">Project changed after research</strong>
          <p className="text-sm">{state.project_changes.slice(-3).join("; ")}.</p>
          <Button size="sm" onClick={() => navigate(paths.overview())}>Review changes</Button>
        </div>
      )}
      {gapsOf(state).length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => navigate(paths.gaps())}>
          {plural(gapsOf(state).length, "research gap")} identified <ArrowRight size={14} aria-hidden />
        </Button>
      )}
    </div>
  );
}

function UploadNotice({ status, onClear }) {
  if (!status) return null;
  const text = {
    uploading: `Uploading ${status.name}… ${Math.round((status.progress || 0) * 100)}%`,
    processing: `Processing ${status.name}: extracting text and asking the Judge to evaluate it…`,
    ready: `${status.name} is ready in your library.`,
    failed: `${status.name} could not be added: ${status.error}`,
  }[status.phase];
  return (
    <div className={`notice notice--${status.phase}`} role="status">
      {(status.phase === "uploading" || status.phase === "processing") && <Spinner />}
      <span>{text}</span>
      {status.phase === "ready" && status.paperId && <Button size="sm" onClick={() => navigate(paths.paper(status.paperId))}>Open paper</Button>}
      {(status.phase === "ready" || status.phase === "failed") && <Button size="sm" variant="ghost" onClick={onClear}>Dismiss</Button>}
    </div>
  );
}

export default function ChatWorkspace({ panelOpen, onClosePanel }) {
  const { view, state, events, actions, busy, error } = useSession();
  const { status: uploadStatus, upload, clear } = useUpload();
  const end = useRef(null);

  // one timeline: interview messages first, then research runs and chat, ordered by time
  const timeline = useMemo(() => {
    if (!view) return [];
    const runs = {};
    events.forEach((e) => { (runs[e.run] ||= []).push(e); });
    let round = 0;
    const runItems = Object.entries(runs)
      .map(([r, evs]) => ({ r: Number(r), evs }))
      .sort((a, b) => a.r - b.r)
      .filter(({ evs }) => evs.some((e) => e.agent !== "interviewer" && e.kind !== "node_done"))
      .map(({ r, evs }) => {
        if (evs.some((e) => e.agent === "researcher" && e.kind === "decision")) round += 1;
        return { type: "run", key: `run-${r}`, run: r, evs, round, ts: evs.find((e) => e.ts)?.ts ?? 0 };
      });
    const chat = view.chat.map((m, i) => ({ type: "chat", key: `chat-${i}`, m, ts: m.ts ?? 0 }));
    return [...runItems, ...chat].sort((a, b) => a.ts - b.ts);
  }, [view, events]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [timeline.length, view?.pending?.type, view?.state?.messages?.length]);

  if (!view) return <Workspace open={false}><StartScreen /></Workspace>;

  const p = view.pending;
  const interviewing = state.phase === "interview" || state.phase === "brief_approval";
  const questionOpen = p?.type === "question";
  const waiting = view.running && !timeline.some((t) => t.type === "run" && t.run === view.run);
  const decide = (value) => actions.resume(value).catch(() => {});

  const panel = interviewing ? <InterviewProgress state={state} /> : <ResearchProgress state={state} view={view} />;

  return (
    <Workspace open={panelOpen} onClose={onClosePanel} panel={panel} panelTitle={interviewing ? "Interview progress" : "Research progress"}>
      <div className="chat">
        <div className="chat__scroll">
          <div className="chat__column">
            {state.messages.map((m, i) => (
              <Message key={`m-${i}`} role={m.role} label="Interviewer">{m.content}</Message>
            ))}
            {timeline.map((t) => t.type === "run"
              ? <RunSummary key={t.key} events={t.evs} running={view.running && t.run === view.run} state={state} round={t.round} />
              : <Message key={t.key} role={t.m.role} label="Research Assistant">{t.m.content}</Message>)}

            {waiting && (
              <div className="msg msg--assistant"><div className="msg__body row gap-2 subtle"><Spinner />
                {interviewing ? "The interviewer is reading your answer…" : "Starting…"}</div></div>
            )}
            {busy === "Thinking…" && <div className="msg msg--assistant"><div className="msg__body row gap-2 subtle"><Spinner /> Thinking…</div></div>}

            {p?.type === "approve_brief" && <BriefApproval key={JSON.stringify(p.brief)} brief={p.brief} onDecide={decide} disabled={!!busy} />}
            {p?.type === "approve_more_research" && <MoreResearchApproval p={p} onDecide={decide} disabled={!!busy} />}
            {p?.type === "scope_review" && <ScopeApproval p={p} onDecide={decide} disabled={!!busy} />}
            {p?.type === "report_review" && <ReportApproval onDecide={decide} disabled={!!busy} version={state.report_version} />}
            {state.phase === "done" && !view.running && (
              <p className="done-note"><CircleCheck size={15} aria-hidden /> Project complete. You can still ask questions, request research or edit the report.</p>
            )}
            {(view.error || error) && !view.running && (
              <ErrorState title="This step did not finish" message={view.error || error}
                onRetry={view.error ? actions.retry : undefined} />
            )}
            <UploadNotice status={uploadStatus} onClear={clear} />
            <div ref={end} />
          </div>
        </div>
        <div className="chat__footer">
          {interviewing && <InterviewProgress state={state} compact />}
          <ChatComposer
            placeholder={questionOpen ? "Answer the interviewer…"
              : interviewing ? "Waiting for the interviewer…" : "Ask a question, request research, or modify your project…"}
            disabled={(interviewing && !questionOpen) || !!busy}
            onSend={(t) => (questionOpen ? decide({ answer: t }) : actions.chat(t).catch(() => {}))}
            quickReplies={questionOpen ? INTERVIEW_QUICK : null}
            onQuick={(t) => decide({ answer: t })}
            tools={!interviewing}
            onUpload={upload}
            autoFocus={questionOpen}
          />
        </div>
      </div>
    </Workspace>
  );
}
