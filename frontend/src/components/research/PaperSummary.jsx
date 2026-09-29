import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import { useSession } from "../../lib/session.jsx";
import { Button, ErrorState, LoadingState } from "../ui/primitives.jsx";

const isMissing = (v) => !v || /^not reported/i.test(String(v).trim());

function Field({ label, value }) {
  const list = Array.isArray(value) ? value.filter((x) => !isMissing(x)) : null;
  const empty = list ? list.length === 0 : isMissing(value);
  return (
    <div className="summary__field">
      <dt>{label}</dt>
      <dd className={empty ? "subtle" : ""}>
        {empty ? "Not reported in the available text" : list ? <ul className="bullets">{list.map((x, i) => <li key={i}>{x}</li>)}</ul> : value}
      </dd>
    </div>
  );
}

/** Structured summary (generated once from the paper text, then cached with the project). */
export default function PaperSummary({ paperId }) {
  const { view } = useSession();
  const cached = view.extras?.summaries?.[paperId];
  const [data, setData] = useState(cached || null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = (refresh = false) => {
    setLoading(true); setErr(null);
    api.summary(view.thread_id, paperId, refresh).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (!cached) load(); else setData(cached); }, [paperId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <ErrorState title="The summary could not be generated" message={err} onRetry={() => load()} />;
  if (loading || !data) return <LoadingState label="Reading the paper and writing a structured summary…" lines={7} />;
  return (
    <div className="summary">
      <div className="row between">
        <p className="text-xs subtle">Based on the {data.basis}. Fields the paper doesn't state are marked as not reported.</p>
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => load(true)}>Regenerate</Button>
      </div>
      <dl>
        <Field label="Research objective" value={data.objective} />
        <Field label="Methodology" value={data.methodology} />
        <Field label="Models / algorithms" value={data.models} />
        <Field label="Datasets" value={data.datasets} />
        <Field label="Major findings" value={data.findings} />
        <Field label="Limitations" value={data.limitations} />
        <Field label="Relevance to your project" value={data.relevance} />
        <Field label="Worth reading" value={data.useful_sections} />
      </dl>
    </div>
  );
}
