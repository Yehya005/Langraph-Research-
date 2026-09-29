import { useEffect, useRef, useState } from "react";
import { BookOpen, Brain, ChevronDown, ChevronRight, CircleCheck, FileSearch, Scale, Search, Sparkles } from "lucide-react";
import { Markdown, Spinner } from "../ui/primitives.jsx";
import { duration } from "../../lib/format.js";

export const AGENT_NAME = {
  interviewer: "Interviewer", researcher: "Researcher", judge: "Judge", analyst: "Analyst",
  reporter: "Reporter", report_editor: "Reporter",
};
const KIND_ICON = { status: Sparkles, thought: Brain, search: Search, read: BookOpen, result: FileSearch, score: Scale, decision: CircleCheck };

function Step({ e }) {
  const [open, setOpen] = useState(false);
  const Icon = KIND_ICON[e.kind] || Sparkles;
  const long = e.kind === "thought" && e.text.length > 240;
  return (
    <li className={`step step--${e.kind}`}>
      <Icon size={14} className="step__icon" aria-hidden />
      <div className="step__body">
        <span className="step__agent">{AGENT_NAME[e.agent] || e.agent}</span>
        {e.kind === "thought" ? (
          <div className="step__thought">
            {long && !open ? <p>{e.text.replace(/[*#_`]/g, "").slice(0, 240)}…</p> : <Markdown>{e.text}</Markdown>}
            {long && <button type="button" className="link-btn" onClick={() => setOpen(!open)}>{open ? "Show less" : "Show more"}</button>}
          </div>
        ) : <span className="step__text">{e.text}</span>}
        {e.links?.length > 0 && (
          <ul className="step__list">
            {e.links.slice(0, 5).map((l, i) => <li key={i}><a href={l.url} target="_blank" rel="noreferrer">{l.title}</a></li>)}
            {e.links.length > 5 && <li className="subtle">+{e.links.length - 5} more</li>}
          </ul>
        )}
        {e.scores?.length > 0 && (
          <ul className="step__list">
            {e.scores.map((s, i) => <li key={i} title={s.note}><span className="mono">{Math.round(s.score * 100)}%</span> {s.title}</li>)}
          </ul>
        )}
      </div>
    </li>
  );
}

export const visibleSteps = (events) => events.filter((e) => e.kind !== "node_done");

export function stepSummary(events) {
  const n = (k) => events.filter((e) => e.kind === k).length;
  return [n("search") && `${n("search")} searches`, n("read") && `${n("read")} sources read`, n("thought") && `${n("thought")} thoughts`]
    .filter(Boolean).join(" · ");
}

export function runDuration(events) {
  const ts = events.map((e) => e.ts).filter(Boolean);
  return ts.length > 1 ? duration(Math.max(...ts) - Math.min(...ts)) : "";
}

/** Collapsible reasoning trace for one graph run: open while running, collapsed afterwards. */
export default function Thinking({ events, running }) {
  const steps = visibleSteps(events);
  const [open, setOpen] = useState(running);
  const end = useRef(null);
  useEffect(() => { if (running) setOpen(true); }, [running]);
  useEffect(() => { if (running && open) end.current?.scrollIntoView({ block: "nearest" }); }, [steps.length, running, open]);
  if (!steps.length) return null;
  const last = steps[steps.length - 1];
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className={`thinking ${running ? "is-live" : ""}`}>
      <button type="button" className="thinking__head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {running ? <Spinner /> : <Chevron size={14} aria-hidden />}
        <span className="thinking__label">{running ? last.text : `Reasoning${runDuration(events) ? ` · ${runDuration(events)}` : ""}`}</span>
        <span className="thinking__meta">{stepSummary(steps)}</span>
      </button>
      {open && <ol className="thinking__steps">{steps.map((e, i) => <Step key={i} e={e} />)}<div ref={end} /></ol>}
    </div>
  );
}
