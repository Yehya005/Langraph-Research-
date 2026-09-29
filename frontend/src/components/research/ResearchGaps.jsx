import { Lightbulb, MessageCircleQuestion, Search } from "lucide-react";
import { useSession } from "../../lib/session.jsx";
import { navigate, paths } from "../../lib/router.js";
import { gapsOf, researchAction, researchUnavailableReason } from "../../lib/research.js";
import { Button, EmptyState, Tag } from "../ui/primitives.jsx";
import Workspace from "../layout/Workspace.jsx";

function GapCard({ gap, index, focused, act, reason }) {
  const { actions } = useSession();
  const research = () => {
    actions.resume(act(`Research gap: ${gap.title}. ${gap.explanation}`)).then(() => navigate(paths.chat())).catch(() => {});
  };
  return (
    <article className={`gap ${focused ? "is-focused" : ""}`} id={`gap-${index}`}>
      <header className="gap__head">
        <h3 className="h3">{gap.title}</h3>
        {gap.feature && <Tag>{gap.feature}</Tag>}
      </header>
      <p>{gap.explanation}</p>
      {gap.evidence && <p className="text-sm"><span className="gap__label">Evidence</span>{gap.evidence}</p>}
      {gap.why_research && <p className="text-sm"><span className="gap__label">Why research it</span>{gap.why_research}</p>}
      <div className="row gap-2">
        <Button size="sm" variant="primary" icon={Search} disabled={!act} title={act ? undefined : reason} onClick={research}>Research this gap</Button>
        <Button size="sm" variant="ghost" icon={MessageCircleQuestion}
          onClick={() => actions.askAbout({ kind: "gap", ids: [String(index)], title: gap.title })}>Ask AI</Button>
      </div>
      {!act && <p className="text-xs subtle">{reason}</p>}
    </article>
  );
}

export default function ResearchGaps({ focus, panelOpen, onClosePanel }) {
  const { view, state } = useSession();
  const gaps = gapsOf(state);
  const act = researchAction(view);
  const reason = researchUnavailableReason(view);
  const opps = state.analysis?.contribution_opportunities || [];
  const limits = state.analysis?.limitations_of_current_work || [];

  return (
    <Workspace open={panelOpen} onClose={onClosePanel}>
      <div className="page page--narrow">
        <header className="page__header">
          <div>
            <h2 className="h1">Research gaps</h2>
            <p className="subtle text-sm">What the Judge found missing from the evidence, and where the Analyst sees room to contribute.
              Researching a gap goes through the normal approval workflow.</p>
          </div>
        </header>
        {gaps.length === 0 ? (
          <EmptyState icon={Lightbulb} title="No gaps identified yet">Gaps appear after the Judge evaluates the first research round.</EmptyState>
        ) : (
          <section className="stack gap-3">
            <h3 className="eyebrow">Missing evidence · Judge</h3>
            {gaps.map((g, i) => <GapCard key={i} gap={g} index={i} focused={String(i) === focus} act={act} reason={reason} />)}
          </section>
        )}
        {opps.length > 0 && (
          <section className="stack gap-3">
            <h3 className="eyebrow">Where you could contribute · Analyst</h3>
            {opps.map((o, i) => (
              <article key={i} className="gap">
                <header className="gap__head">
                  <h3 className="h3">{o.title}</h3>
                  <Tag>Feasibility: {o.feasibility}</Tag>
                  <Tag muted>{o.data_available ? "Data found" : "Data missing"}</Tag>
                </header>
                <p>{o.description}</p>
                <p className="text-sm"><span className="gap__label">Why it's open</span>{o.why_open}</p>
              </article>
            ))}
          </section>
        )}
        {limits.length > 0 && (
          <section className="stack gap-2">
            <h3 className="eyebrow">Limitations of current work · Analyst</h3>
            <ul className="bullets">{limits.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </section>
        )}
      </div>
    </Workspace>
  );
}
