import { ArrowRight } from "lucide-react";
import Thinking, { AGENT_NAME } from "./Thinking.jsx";
import { PaperMini } from "../research/Cards.jsx";
import { Button } from "../ui/primitives.jsx";
import { datasetStatus, paperStatus } from "../../lib/research.js";
import { navigate, paths } from "../../lib/router.js";
import { plural } from "../../lib/format.js";

function counts(items, verdicts, statusFn) {
  const c = { accepted: 0, review: 0, rejected: 0 };
  items.forEach((x) => { const s = statusFn(verdicts[x.id]); if (s in c) c[s] += 1; });
  return c;
}

function judgeLine(state, round) {
  const papers = state.papers.filter((p) => p.research_round === round && state.paper_verdicts[p.id]);
  const datasets = state.datasets.filter((d) => d.research_round === round && state.dataset_verdicts[d.id]);
  const cp = counts(papers, state.paper_verdicts, paperStatus);
  const cd = counts(datasets, state.dataset_verdicts, datasetStatus);
  const part = (c, n, word) => n ? `${plural(n, word)}: ${c.accepted} useful, ${c.review} need review, ${c.rejected} rejected` : null;
  return [part(cp, papers.length, "paper"), part(cd, datasets.length, "dataset")].filter(Boolean).join(". ");
}

/** One graph run as it reads in the conversation: each agent's outcome, then the reasoning trace. */
export default function RunSummary({ events, running, state, round }) {
  const outputs = events.filter((e) => e.kind === "decision" && e.agent !== "interviewer");
  const found = state.papers
    .filter((p) => p.research_round === round && p.source !== "upload")
    .sort((a, b) => (state.paper_verdicts[b.id]?.relevance ?? -1) - (state.paper_verdicts[a.id]?.relevance ?? -1))
    .slice(0, 3);

  return (
    <div className="msg msg--assistant">
      <div className="msg__body stack gap-3">
        {outputs.map((e, i) => (
          <div key={i} className="agent-output">
            <span className="agent-label">{AGENT_NAME[e.agent] || e.agent}</span>
            <p>{e.text}</p>
            {e.agent === "researcher" && found.length > 0 && (
              <div className="mini-grid">
                {found.map((p) => <PaperMini key={p.id} paper={p} verdict={state.paper_verdicts[p.id]} />)}
                <Button size="sm" variant="ghost" onClick={() => navigate(paths.library("papers"))}>
                  View library <ArrowRight size={14} aria-hidden />
                </Button>
              </div>
            )}
            {e.agent === "judge" && judgeLine(state, round) && <p className="text-sm subtle">{judgeLine(state, round)}</p>}
            {e.agent === "judge" && e.gaps?.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => navigate(paths.gaps())}>
                {plural(e.gaps.length, "research gap")} <ArrowRight size={14} aria-hidden />
              </Button>
            )}
            {e.agent === "analyst" && (
              <Button size="sm" variant="ghost" onClick={() => navigate(paths.overview())}>
                Read the analysis <ArrowRight size={14} aria-hidden />
              </Button>
            )}
            {e.agent === "reporter" && (
              <Button size="sm" variant="ghost" onClick={() => navigate(paths.report())}>
                Open report <ArrowRight size={14} aria-hidden />
              </Button>
            )}
          </div>
        ))}
        <Thinking events={events} running={running} />
      </div>
    </div>
  );
}
