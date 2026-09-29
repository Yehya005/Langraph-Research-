import { BookOpen, Database, ExternalLink, FileText, MessageCircleQuestion, ScrollText } from "lucide-react";
import { Button, LinkButton, StatusBadge, Tag } from "../ui/primitives.jsx";
import { datasetStatus, paperStatus, SOURCE_LABEL } from "../../lib/research.js";
import { authorsShort, pct } from "../../lib/format.js";
import { navigate, paths } from "../../lib/router.js";
import { useSession } from "../../lib/session.jsx";

/** Library paper result: only what helps decide whether to open it. Details live in the reader. */
export function PaperCard({ paper, verdict, selected, onSelect, inactive }) {
  const { actions } = useSession();
  const features = verdict?.related_features || [];
  return (
    <article className={`result ${selected ? "is-selected" : ""} ${inactive ? "is-inactive" : ""}`}>
      <label className="result__check">
        <input type="checkbox" checked={!!selected} onChange={() => onSelect(paper.id)} aria-label={`Select ${paper.title} to compare`} />
      </label>
      <div className="result__main">
        <div className="result__top">
          <button type="button" className="result__title" onClick={() => navigate(paths.paper(paper.id))}>{paper.title}</button>
          <StatusBadge status={paperStatus(verdict)} />
        </div>
        <p className="result__meta">
          {authorsShort(paper.authors)}{paper.year ? ` · ${paper.year}` : ""} · {SOURCE_LABEL[paper.source]}
          {paper.citation_count != null && ` · ${paper.citation_count} citations`}
          {verdict && <span title="Judge relevance"> · relevance {pct(verdict.relevance)}</span>}
        </p>
        {verdict?.value_added && <p className="result__why">{verdict.value_added}</p>}
        {(features.length > 0 || inactive) && (
          <div className="result__tags">
            {inactive && <Tag muted title="All linked features were removed from the project">Removed feature</Tag>}
            {features.slice(0, 3).map((f) => <Tag key={f}>{f}</Tag>)}
          </div>
        )}
        <div className="result__actions">
          <Button size="sm" variant="ghost" icon={BookOpen} onClick={() => navigate(paths.paper(paper.id))}>Open</Button>
          <Button size="sm" variant="ghost" icon={ScrollText} onClick={() => navigate(paths.paper(paper.id, "summary"))}>Summary</Button>
          <Button size="sm" variant="ghost" icon={MessageCircleQuestion}
            onClick={() => actions.askAbout({ kind: "paper", ids: [paper.id], title: paper.title })}>Ask AI</Button>
          <Button size="sm" variant="ghost" aria-pressed={!!selected} onClick={() => onSelect(paper.id)}>
            {selected ? "Selected for compare" : "Compare"}
          </Button>
        </div>
      </div>
    </article>
  );
}

/** Small card used in chat responses. */
export function PaperMini({ paper, verdict }) {
  return (
    <button type="button" className="mini-card" onClick={() => navigate(paths.paper(paper.id))}>
      <FileText size={16} className="mini-card__icon" aria-hidden />
      <span className="mini-card__title">{paper.title}</span>
      <span className="mini-card__meta">{authorsShort(paper.authors)}{paper.year ? ` · ${paper.year}` : ""}</span>
      <StatusBadge status={paperStatus(verdict)} />
    </button>
  );
}

export function DatasetCard({ dataset, verdict, inactive }) {
  const { actions } = useSession();
  return (
    <article className={`result ${inactive ? "is-inactive" : ""}`}>
      <span className="result__lead"><Database size={16} aria-hidden /></span>
      <div className="result__main">
        <div className="result__top">
          <button type="button" className="result__title" onClick={() => navigate(paths.dataset(dataset.id))}>{dataset.title}</button>
          <StatusBadge status={datasetStatus(verdict)} />
        </div>
        <p className="result__meta">
          {SOURCE_LABEL[dataset.source]}
          {dataset.downloads != null && ` · ${dataset.downloads.toLocaleString()} downloads`}
          {verdict && <span title="Judge usefulness"> · usefulness {pct(verdict.usefulness)}</span>}
        </p>
        {verdict?.used_for && <p className="result__why">{verdict.used_for}</p>}
        {(verdict?.covered_features?.length > 0 || inactive) && (
          <div className="result__tags">
            {inactive && <Tag muted title="All linked features were removed from the project">Removed feature</Tag>}
            {verdict.covered_features.slice(0, 4).map((f) => <Tag key={f}>{f}</Tag>)}
          </div>
        )}
        <div className="result__actions">
          <Button size="sm" variant="ghost" onClick={() => navigate(paths.dataset(dataset.id))}>Details</Button>
          <Button size="sm" variant="ghost" icon={MessageCircleQuestion}
            onClick={() => actions.askAbout({ kind: "dataset", ids: [dataset.id], title: dataset.title })}>Ask AI</Button>
          <LinkButton size="sm" variant="ghost" icon={ExternalLink} href={dataset.url} target="_blank" rel="noreferrer">Source</LinkButton>
        </div>
      </div>
    </article>
  );
}
