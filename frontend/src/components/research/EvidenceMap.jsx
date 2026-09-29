import { useMemo, useState } from "react";
import { CircleAlert, Database, FileText, ListTree } from "lucide-react";
import { useSession } from "../../lib/session.jsx";
import { navigate, paths } from "../../lib/router.js";
import { datasetStatus, gapsOf, paperStatus, removedFeatures, sameFeature } from "../../lib/research.js";
import { plural } from "../../lib/format.js";
import { EmptyState, StatusBadge } from "../ui/primitives.jsx";
import Workspace from "../layout/Workspace.jsx";

function Leaf({ icon: Icon, label, status, onClick, kind }) {
  return (
    <li className={`tree__leaf tree__leaf--${kind}`}>
      <button type="button" onClick={onClick}>
        <Icon size={14} aria-hidden />
        <span className="tree__label">{label}</span>
        {status && <StatusBadge status={status} />}
      </button>
    </li>
  );
}

function Branch({ name, papers, datasets, gaps, state, muted, note }) {
  const empty = !papers.length && !datasets.length && !gaps.length;
  return (
    <li className={`tree__branch ${muted ? "is-muted" : ""}`}>
      <div className="tree__node">
        <strong>{name}</strong>
        <span className="text-xs subtle">
          {empty ? "No evidence yet" : [papers.length && plural(papers.length, "paper"), datasets.length && plural(datasets.length, "dataset"),
            gaps.length && plural(gaps.length, "gap")].filter(Boolean).join(" · ")}
          {note && ` · ${note}`}
        </span>
      </div>
      {!empty && (
        <ul className="tree__children">
          {papers.map((p) => <Leaf key={p.id} kind="paper" icon={FileText} label={p.title} status={paperStatus(state.paper_verdicts[p.id])}
            onClick={() => navigate(paths.paper(p.id))} />)}
          {datasets.map((d) => <Leaf key={d.id} kind="dataset" icon={Database} label={d.title} status={datasetStatus(state.dataset_verdicts[d.id])}
            onClick={() => navigate(paths.dataset(d.id))} />)}
          {gaps.map(({ g, i }) => <Leaf key={`g${i}`} kind="gap" icon={CircleAlert} label={`Gap: ${g.title}`} onClick={() => navigate(paths.gaps(i))} />)}
        </ul>
      )}
    </li>
  );
}

/** Project → features → the papers, datasets and gaps linked to each feature (by the Judge's tags). */
export default function EvidenceMap({ panelOpen, onClosePanel }) {
  const { state } = useSession();
  const [showRejected, setShowRejected] = useState(false);
  const features = state.brief?.features || [];
  const removed = removedFeatures(state);

  const tree = useMemo(() => {
    const keepP = (p) => showRejected || paperStatus(state.paper_verdicts[p.id]) !== "rejected";
    const keepD = (d) => showRejected || datasetStatus(state.dataset_verdicts[d.id]) !== "rejected";
    const papersFor = (f) => state.papers.filter((p) => keepP(p) && (state.paper_verdicts[p.id]?.related_features || []).some((t) => sameFeature(t, f)));
    const datasetsFor = (f) => state.datasets.filter((d) => keepD(d) && (state.dataset_verdicts[d.id]?.covered_features || []).some((t) => sameFeature(t, f)));
    const gaps = gapsOf(state).map((g, i) => ({ g, i }));
    const gapsFor = (f) => gaps.filter(({ g }) => g.feature && sameFeature(g.feature, f));
    const all = [...features, ...removed];
    const linkedP = new Set(), linkedD = new Set(), linkedG = new Set();
    const branch = (f) => {
      const b = { name: f, papers: papersFor(f), datasets: datasetsFor(f), gaps: gapsFor(f) };
      b.papers.forEach((p) => linkedP.add(p.id)); b.datasets.forEach((d) => linkedD.add(d.id)); b.gaps.forEach(({ i }) => linkedG.add(i));
      return b;
    };
    const active = features.map(branch);
    const gone = removed.map(branch);
    // research questions often carry the rest of the gaps
    const rq = (state.brief?.research_questions || []).map((q) => ({ name: q, papers: [], datasets: [], gaps: gapsFor(q).filter(({ i }) => !linkedG.has(i)) }))
      .filter((b) => { b.gaps.forEach(({ i }) => linkedG.add(i)); return b.gaps.length; });
    const other = {
      name: "Not linked to a feature",
      papers: state.papers.filter((p) => keepP(p) && !linkedP.has(p.id) && state.paper_verdicts[p.id]),
      datasets: state.datasets.filter((d) => keepD(d) && !linkedD.has(d.id) && state.dataset_verdicts[d.id]),
      gaps: gaps.filter(({ i }) => !linkedG.has(i)),
    };
    return { active, gone, rq, other, all };
  }, [state, features, removed, showRejected]);

  return (
    <Workspace open={panelOpen} onClose={onClosePanel}>
      <div className="page">
        <header className="page__header">
          <div>
            <h2 className="h1">Evidence map</h2>
            <p className="subtle text-sm">What evidence supports each part of the project. Links come from the Judge's tags on each source.</p>
          </div>
          <label className="toggle"><input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> Show rejected sources</label>
        </header>
        {!state.brief ? (
          <EmptyState icon={ListTree} title="No project brief yet">The map is built from your approved brief and the Judge's evaluations.</EmptyState>
        ) : (
          <div className="tree">
            <div className="tree__root">{state.brief.title}</div>
            <ul className="tree__branches">
              {tree.active.map((b) => <Branch key={b.name} {...b} state={state} />)}
              {tree.rq.map((b) => <Branch key={b.name} {...b} state={state} note="research question" />)}
              {tree.gone.map((b) => <Branch key={b.name} {...b} state={state} muted note="removed from project" />)}
              {(tree.other.papers.length + tree.other.datasets.length + tree.other.gaps.length > 0) && <Branch {...tree.other} state={state} muted />}
            </ul>
          </div>
        )}
      </div>
    </Workspace>
  );
}
