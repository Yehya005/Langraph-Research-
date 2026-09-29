import { useEffect, useState } from "react";
import { ArrowLeft, GitCompareArrows } from "lucide-react";
import { api } from "../../lib/api.js";
import { useSession } from "../../lib/session.jsx";
import { navigate, paths } from "../../lib/router.js";
import { authorsShort } from "../../lib/format.js";
import { Button, EmptyState, ErrorState, LoadingState } from "../ui/primitives.jsx";
import Workspace from "../layout/Workspace.jsx";
import SourceChat from "./SourceChat.jsx";

const ASPECTS = [
  ["objective", "Objective"], ["methodology", "Methodology"], ["models", "Models / algorithms"], ["datasets", "Datasets"],
  ["hardware", "Hardware"], ["results", "Results"], ["limitations", "Limitations"], ["relevance", "Relevance to your project"],
];
const missing = (v) => !v || /^not reported/i.test(v.trim());

export default function PaperComparison({ ids }) {
  const { view, state } = useSession();
  const key = [...ids].sort().join(",");
  const [data, setData] = useState(view.extras?.comparisons?.[key] || null);
  const [err, setErr] = useState(null);
  const papers = ids.map((id) => state.papers.find((p) => p.id === id)).filter(Boolean);

  const load = () => { setErr(null); api.compare(view.thread_id, ids).then(setData).catch((e) => setErr(e.message)); };
  useEffect(() => { if (!view.extras?.comparisons?.[key] && papers.length >= 2) load(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (papers.length < 2) {
    return <Workspace open={false}><div className="page"><EmptyState icon={GitCompareArrows} title="Select at least two papers"
      actions={<Button onClick={() => navigate(paths.library("papers"))}>Open library</Button>}>
      Tick papers in the library, then choose Compare selected.</EmptyState></div></Workspace>;
  }
  const row = (pid) => data?.rows.find((r) => r.paper_id === pid);

  return (
    <Workspace open={false}>
      <div className="page page--wide">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate(paths.library("papers"))}>Library</Button>
        <header className="page__header">
          <div>
            <h2 className="h1">Comparing {papers.length} papers</h2>
            <p className="subtle text-sm">Extracted from each paper's text. "Not reported" means the paper doesn't state it.</p>
          </div>
        </header>
        {err ? <ErrorState title="The comparison could not be built" message={err} onRetry={load} />
          : !data ? <LoadingState label={`Reading ${papers.length} papers and comparing them…`} lines={8} />
          : (
            <>
              <div className="table-wrap">
                <table className="compare">
                  <thead>
                    <tr>
                      <th scope="col"><span className="sr-only">Aspect</span></th>
                      {papers.map((p) => (
                        <th key={p.id} scope="col">
                          <button type="button" className="link-btn compare__paper" onClick={() => navigate(paths.paper(p.id))}>{p.title}</button>
                          <span className="text-xs subtle">{authorsShort(p.authors)}{p.year ? ` · ${p.year}` : ""} · {data.basis?.[p.id]}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ASPECTS.map(([k, label]) => (
                      <tr key={k}>
                        <th scope="row">{label}</th>
                        {papers.map((p) => {
                          const v = row(p.id)?.[k];
                          return <td key={p.id} className={missing(v) ? "subtle" : ""}>{missing(v) ? "Not reported" : v}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="two-col">
                <section><h3 className="h3">In common</h3><ul className="bullets">{data.common_ground.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
                <section><h3 className="h3">Key differences</h3><ul className="bullets">{data.differences.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
              </div>
              <section className="compare__ask">
                <h3 className="h3">Ask about this comparison</h3>
                <SourceChat source={{ kind: "comparison", ids }} compact />
              </section>
            </>
          )}
      </div>
    </Workspace>
  );
}
