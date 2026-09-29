import { useMemo, useState } from "react";
import { Database, FileText, FileUp, GitCompareArrows, Search, X } from "lucide-react";
import { useSession } from "../../lib/session.jsx";
import { useUpload } from "../../lib/useUpload.js";
import { navigate, paths } from "../../lib/router.js";
import { datasetStatus, paperStatus, removedFeatures, sameFeature, SOURCE_LABEL } from "../../lib/research.js";
import { Button, EmptyState, Select, Spinner, Tabs } from "../ui/primitives.jsx";
import { DatasetCard, PaperCard } from "./Cards.jsx";
import Workspace from "../layout/Workspace.jsx";

const STATUS_OPTIONS = [
  { value: "all", label: "Any Judge status" }, { value: "accepted", label: "Accepted" },
  { value: "review", label: "Needs review" }, { value: "rejected", label: "Rejected" }, { value: "pending", label: "Not evaluated" },
];

/** true when every feature this item is linked to has been removed from the project */
function isInactive(tags, active, removed) {
  if (!tags?.length || !removed.length) return false;
  return !tags.some((t) => active.some((f) => sameFeature(t, f))) && tags.some((t) => removed.some((f) => sameFeature(t, f)));
}

function Toolbar({ q, setQ, filters, count, total, onUpload }) {
  return (
    <div className="toolbar">
      <label className="search">
        <Search size={15} aria-hidden />
        <span className="sr-only">Search</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, authors, notes…" />
        {q && <button type="button" className="search__clear" aria-label="Clear search" onClick={() => setQ("")}><X size={14} /></button>}
      </label>
      <div className="toolbar__filters">{filters}</div>
      <span className="toolbar__count text-xs subtle">{count === total ? `${total} results` : `${count} of ${total}`}</span>
      {onUpload}
    </div>
  );
}

export default function ResearchLibrary({ tab, panelOpen, onClosePanel }) {
  const { state } = useSession();
  const { status, upload } = useUpload();
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [judge, setJudge] = useState("all");
  const [feature, setFeature] = useState("all");
  const [year, setYear] = useState("all");
  const [sort, setSort] = useState("score");
  const [selected, setSelected] = useState([]);

  const features = state.brief?.features || [];
  const removed = removedFeatures(state);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-5)));
  const switchTab = (t) => { setSource("all"); setFeature("all"); navigate(paths.library(t)); };
  const text = q.trim().toLowerCase();
  const nowYear = new Date().getFullYear();

  const papers = useMemo(() => {
    const pv = state.paper_verdicts;
    const out = state.papers.filter((p) => {
      const v = pv[p.id];
      if (source !== "all" && p.source !== source) return false;
      if (judge !== "all" && paperStatus(v) !== judge) return false;
      if (feature !== "all" && !(v?.related_features || []).some((t) => sameFeature(t, feature))) return false;
      if (year === "2y" && !(p.year >= nowYear - 2)) return false;
      if (year === "5y" && !(p.year >= nowYear - 5)) return false;
      if (year === "older" && !(p.year && p.year < nowYear - 5)) return false;
      if (text && !`${p.title} ${p.authors.join(" ")} ${v?.value_added || ""} ${p.abstract}`.toLowerCase().includes(text)) return false;
      return true;
    });
    const by = {
      score: (a, b) => (pv[b.id]?.relevance ?? -1) - (pv[a.id]?.relevance ?? -1),
      newest: (a, b) => (b.year || 0) - (a.year || 0),
      oldest: (a, b) => (a.year || 9999) - (b.year || 9999),
      title: (a, b) => a.title.localeCompare(b.title),
    }[sort] || (() => 0);
    return out.sort(by);
  }, [state, source, judge, feature, year, text, sort, nowYear]);

  const datasets = useMemo(() => {
    const dv = state.dataset_verdicts;
    const out = state.datasets.filter((d) => {
      const v = dv[d.id];
      if (source !== "all" && d.source !== source) return false;
      if (judge !== "all" && datasetStatus(v) !== judge) return false;
      if (feature !== "all" && !(v?.covered_features || []).some((t) => sameFeature(t, feature))) return false;
      if (text && !`${d.title} ${d.description} ${v?.notes || ""} ${v?.used_for || ""}`.toLowerCase().includes(text)) return false;
      return true;
    });
    const by = {
      score: (a, b) => (dv[b.id]?.usefulness ?? -1) - (dv[a.id]?.usefulness ?? -1),
      downloads: (a, b) => (b.downloads || 0) - (a.downloads || 0),
      title: (a, b) => a.title.localeCompare(b.title),
    }[sort] || (() => 0);
    return out.sort(by);
  }, [state, source, judge, feature, text, sort]);

  const sourcesOf = (items) => [...new Set(items.map((x) => x.source))];
  const featureOptions = [{ value: "all", label: "Any feature" }, ...features.map((f) => ({ value: f, label: f }))];
  const sourceOptions = (items) => [{ value: "all", label: "Any source" }, ...sourcesOf(items).map((s) => ({ value: s, label: SOURCE_LABEL[s] || s }))];
  const busyUpload = status && (status.phase === "uploading" || status.phase === "processing");

  const uploadButton = tab === "papers" && (
    <label className={`btn btn--secondary btn--md ${busyUpload ? "is-disabled" : ""}`}>
      {busyUpload ? <Spinner /> : <FileUp size={16} aria-hidden />}
      {busyUpload ? (status.phase === "uploading" ? "Uploading…" : "Processing PDF…") : "Upload PDF"}
      <input type="file" accept="application/pdf" hidden disabled={busyUpload}
        onChange={(e) => { upload(e.target.files[0]).then((id) => id && navigate(paths.paper(id))); e.target.value = ""; }} />
    </label>
  );

  return (
    <Workspace open={panelOpen} onClose={onClosePanel}>
      <div className="page">
        <header className="page__header">
          <div>
            <h2 className="h1">Research library</h2>
            <p className="subtle text-sm">Everything the Researcher found and the Judge evaluated for this project.</p>
          </div>
        </header>
        <Tabs value={tab} onChange={switchTab} tabs={[
          { id: "papers", label: "Papers", icon: FileText, count: state.papers.length },
          { id: "datasets", label: "Datasets", icon: Database, count: state.datasets.length },
        ]} />

        {status?.phase === "failed" && <p className="notice notice--failed" role="alert">{status.name}: {status.error}</p>}

        {tab === "papers" ? (
          <>
            <Toolbar q={q} setQ={setQ} count={papers.length} total={state.papers.length} onUpload={uploadButton} filters={<>
              <Select label="Source" value={source} onChange={setSource} options={sourceOptions(state.papers)} />
              <Select label="Judge status" value={judge} onChange={setJudge} options={STATUS_OPTIONS} />
              {features.length > 0 && <Select label="Feature" value={feature} onChange={setFeature} options={featureOptions} />}
              <Select label="Year" value={year} onChange={setYear} options={[
                { value: "all", label: "Any year" }, { value: "2y", label: "Last 2 years" },
                { value: "5y", label: "Last 5 years" }, { value: "older", label: "Older" }]} />
              <Select label="Sort" value={sort} onChange={setSort} options={[
                { value: "score", label: "Most relevant" }, { value: "newest", label: "Newest" },
                { value: "oldest", label: "Oldest" }, { value: "title", label: "Title" }]} />
            </>} />
            {state.papers.length === 0 ? (
              <EmptyState icon={FileText} title="No papers yet"
                actions={<>{uploadButton}<Button variant="ghost" onClick={() => navigate(paths.chat())}>Go to chat</Button></>}>
                Approve your research brief in the chat, or upload a paper to build your library.
              </EmptyState>
            ) : papers.length === 0 ? (
              <EmptyState icon={Search} title="No papers match these filters" />
            ) : (
              <div className="results">
                {papers.map((p) => {
                  const v = state.paper_verdicts[p.id];
                  return <PaperCard key={p.id} paper={p} verdict={v} selected={selected.includes(p.id)} onSelect={toggle}
                    inactive={isInactive(v?.related_features, features, removed)} />;
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <Toolbar q={q} setQ={setQ} count={datasets.length} total={state.datasets.length} filters={<>
              <Select label="Source" value={source} onChange={setSource} options={sourceOptions(state.datasets)} />
              <Select label="Judge status" value={judge} onChange={setJudge} options={STATUS_OPTIONS} />
              {features.length > 0 && <Select label="Feature" value={feature} onChange={setFeature} options={featureOptions} />}
              <Select label="Sort" value={sort} onChange={setSort} options={[
                { value: "score", label: "Most useful" }, { value: "downloads", label: "Most downloaded" }, { value: "title", label: "Title" }]} />
            </>} />
            {state.datasets.length === 0 ? (
              <EmptyState icon={Database} title="No datasets yet"
                actions={<Button variant="ghost" onClick={() => navigate(paths.chat())}>Go to chat</Button>}>
                Datasets appear here after the Researcher searches Kaggle and Hugging Face.
              </EmptyState>
            ) : datasets.length === 0 ? (
              <EmptyState icon={Search} title="No datasets match these filters" />
            ) : (
              <div className="results">
                {datasets.map((d) => {
                  const v = state.dataset_verdicts[d.id];
                  return <DatasetCard key={d.id} dataset={d} verdict={v} inactive={isInactive(v?.covered_features, features, removed)} />;
                })}
              </div>
            )}
          </>
        )}

        {tab === "papers" && selected.length > 0 && (
          <div className="selection-bar" role="region" aria-label="Selected papers">
            <span className="text-sm">{selected.length} selected</span>
            <Button variant="primary" icon={GitCompareArrows} disabled={selected.length < 2}
              title={selected.length < 2 ? "Select at least 2 papers" : undefined}
              onClick={() => navigate(paths.compare(selected))}>Compare selected</Button>
            <Button variant="ghost" onClick={() => setSelected([])}>Clear</Button>
          </div>
        )}
      </div>
    </Workspace>
  );
}
