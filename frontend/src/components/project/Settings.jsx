import { Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { useSession } from "../../lib/session.jsx";
import { Button } from "../ui/primitives.jsx";
import Workspace from "../layout/Workspace.jsx";

const THEMES = [["auto", "System", Monitor], ["light", "Light", Sun], ["dark", "Dark", Moon]];
const SOURCES = [["arxiv", "arXiv"], ["huggingface", "Hugging Face"], ["kaggle", "Kaggle"], ["semantic_scholar_key", "Semantic Scholar API key"]];

export default function Settings({ theme, onTheme }) {
  const { view, state, config, actions } = useSession();
  const remove = async () => {
    if (window.confirm(`Delete "${state.brief?.title || state.idea}"? This cannot be undone.`)) await actions.remove(view.thread_id);
  };
  return (
    <Workspace open={false}>
      <div className="page page--narrow">
        <header className="page__header"><h2 className="h1">Settings</h2></header>

        <section className="card stack gap-3">
          <h3 className="h2">Appearance</h3>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {THEMES.map(([id, label, Icon]) => (
              <button key={id} type="button" role="radio" aria-checked={theme === id} className={theme === id ? "is-active" : ""} onClick={() => onTheme(id)}>
                <Icon size={15} aria-hidden /> {label}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack gap-3">
          <h3 className="h2">Environment</h3>
          <p className="text-sm subtle">Configured in <code>backend/.env</code>. Restart the app after changing it.</p>
          {config ? (
            <dl className="kv">
              <div className="kv__row"><dt>Language model</dt><dd>{config.provider} · {config.model}</dd></div>
              {SOURCES.map(([k, label]) => (
                <div key={k} className="kv__row"><dt>{label}</dt>
                  <dd>{config.sources[k] ? "Available" : k === "semantic_scholar_key" ? "Not set (searches are rate-limited)" : "Not configured"}</dd></div>
              ))}
            </dl>
          ) : <p className="text-sm subtle">Loading…</p>}
        </section>

        {view && (
          <section className="card stack gap-3">
            <h3 className="h2">This project</h3>
            <p className="text-sm subtle">Projects are saved automatically in <code>backend/data/projects</code>.</p>
            <div><Button variant="danger" icon={Trash2} onClick={remove}>Delete project</Button></div>
          </section>
        )}
      </div>
    </Workspace>
  );
}
