import { useEffect } from "react";
import { ArrowLeft, Database, ExternalLink } from "lucide-react";
import { useSession } from "../../lib/session.jsx";
import { navigate, paths } from "../../lib/router.js";
import { datasetStatus, SOURCE_LABEL } from "../../lib/research.js";
import { pct } from "../../lib/format.js";
import { Button, EmptyState, LinkButton, StatusBadge, Tag } from "../ui/primitives.jsx";
import Workspace from "../layout/Workspace.jsx";
import SourceChat from "./SourceChat.jsx";

const size = (b) => (b == null ? null : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

export default function DatasetDetail({ datasetId, panelOpen, onClosePanel }) {
  const { state, actions } = useSession();
  const d = state.datasets.find((x) => x.id === datasetId);
  const v = state.dataset_verdicts[datasetId];
  useEffect(() => { actions.closeSource(); }, [datasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) {
    return <Workspace open={false}><div className="page"><EmptyState icon={Database} title="Dataset not found"
      actions={<Button onClick={() => navigate(paths.library("datasets"))}>Back to library</Button>} /></div></Workspace>;
  }
  return (
    <Workspace open={panelOpen} onClose={onClosePanel} panelTitle="Research assistant"
      panel={<SourceChat source={{ kind: "dataset", ids: [d.id] }} />}>
      <div className="page page--narrow">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate(paths.library("datasets"))}>Library</Button>
        <header className="paper-head">
          <h2 className="paper-head__title">{d.title}</h2>
          <p className="paper-head__meta">{SOURCE_LABEL[d.source]}{d.downloads != null && ` · ${d.downloads.toLocaleString()} downloads`}
            {d.likes != null && ` · ${d.likes.toLocaleString()} likes`}{size(d.size_bytes) && ` · ${size(d.size_bytes)}`}</p>
          <div className="row gap-2">
            <StatusBadge status={datasetStatus(v)} />
            <LinkButton size="sm" variant="ghost" icon={ExternalLink} href={d.url} target="_blank" rel="noreferrer">Open on {SOURCE_LABEL[d.source]}</LinkButton>
          </div>
        </header>
        {d.description && <p className="prose-block">{d.description}</p>}
        {v ? (
          <dl className="kv">
            <div className="kv__row"><dt>Judge usefulness</dt><dd>{pct(v.usefulness)} · {v.is_valid ? "valid and usable" : "not valid / not usable"}</dd></div>
            <div className="kv__row"><dt>How the project would use it</dt><dd>{v.used_for}</dd></div>
            <div className="kv__row"><dt>Judge notes</dt><dd>{v.notes}</dd></div>
            <div className="kv__row"><dt>Covers features</dt><dd className="row gap-1 wrap">{v.covered_features.length ? v.covered_features.map((f) => <Tag key={f}>{f}</Tag>) : "—"}</dd></div>
          </dl>
        ) : <p className="subtle">The Judge has not evaluated this dataset yet.</p>}
        {d.tags?.length > 0 && <div className="row gap-1 wrap">{d.tags.slice(0, 12).map((t) => <Tag key={t} muted>{t}</Tag>)}</div>}
        <p className="text-xs subtle">Found by: {d.found_by_query} · research round {d.research_round}</p>
      </div>
    </Workspace>
  );
}
