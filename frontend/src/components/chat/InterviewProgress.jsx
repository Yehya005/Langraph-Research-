import { Check, Circle } from "lucide-react";

// The Interviewer returns a DraftBrief every turn (structured output). Progress = filled items / total,
// computed here from that data - it is not a number the model makes up.
const ITEMS = [
  ["goal", "Goal"], ["domain", "Domain"], ["problem_type", "Task type"], ["target_variable", "Target / outcome"],
  ["features", "Features & data needs"], ["constraints", "Constraints"], ["research_questions", "Research questions"],
];
const MAX_TURNS = 10;

const filled = (v) => (Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim()));

export function interviewProgress(state) {
  const draft = state?.interview_draft || state?.brief || {};
  const done = ITEMS.filter(([k]) => filled(draft[k])).length;
  return { draft, done, total: ITEMS.length };
}

/** Compact checklist of what the Interviewer has collected so far. */
export default function InterviewProgress({ state, compact }) {
  const { draft, done, total } = interviewProgress(state);
  const turn = state?.interview_turns || 0;
  const complete = state?.phase !== "interview";
  if (compact) {
    return (
      <div className="iprogress-bar" aria-label={`Interview progress: ${done} of ${total} items collected`}>
        <span className="text-xs">Interview · {done}/{total} collected</span>
        <span className="meter"><span style={{ width: `${(done / total) * 100}%` }} /></span>
      </div>
    );
  }
  return (
    <div className="iprogress">
      <div className="iprogress__head">
        <div>
          <strong>{complete ? "Brief complete" : "Building your research brief"}</strong>
          <p className="text-xs subtle">
            {complete ? "Review and approve it in the chat." : `Question ${turn} · usually 4–8 questions, at most ${MAX_TURNS}`}
          </p>
        </div>
        <span className="iprogress__count">{done}/{total}</span>
      </div>
      <span className="meter"><span style={{ width: `${(done / total) * 100}%` }} /></span>
      <ul className="iprogress__list">
        {ITEMS.map(([key, label]) => {
          const v = draft[key];
          const ok = filled(v);
          return (
            <li key={key} className={ok ? "is-done" : ""}>
              {ok ? <Check size={14} aria-hidden /> : <Circle size={14} aria-hidden />}
              <div>
                <span className="iprogress__label">{label}</span>
                {ok && (Array.isArray(v)
                  ? <ul className="iprogress__values">{v.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  : <p className="iprogress__value">{v}</p>)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
