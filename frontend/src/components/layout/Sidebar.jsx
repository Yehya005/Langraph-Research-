import {
  BookOpenText, Database, FileText, History, Lightbulb, ListTree, MessageSquare, Plus, Settings, SquarePen, Trash2,
  LayoutDashboard,
} from "lucide-react";
import { useSession } from "../../lib/session.jsx";
import { navigate, paths } from "../../lib/router.js";
import { ago } from "../../lib/format.js";
import { gapsOf } from "../../lib/research.js";

const PHASE = {
  interview: "Interview", brief_approval: "Brief ready", research: "Researching", judging: "Evaluating",
  more_research_approval: "Awaiting approval", analysis: "Analyzing", scope_review: "Scope review",
  reporting: "Writing report", report_review: "Report ready", done: "Complete",
};

function NavItem({ icon: Icon, label, count, active, onClick, dot }) {
  return (
    <button type="button" className={`nav__item ${active ? "is-active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      <Icon size={16} aria-hidden />
      <span className="nav__label">{label}</span>
      {dot && <span className="nav__dot" aria-label="needs attention" />}
      {count != null && count > 0 && <span className="nav__count">{count}</span>}
    </button>
  );
}

export default function Sidebar({ route, onNavigate }) {
  const { view, state, projects, actions } = useSession();
  const go = (p) => { navigate(p); onNavigate?.(); };
  const page = route.page;
  const libTab = route.parts[0] || "papers";

  const remove = async (e, p) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${p.title || p.idea}"? This cannot be undone.`)) await actions.remove(p.id);
  };

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="sidebar__brand">
        <BookOpenText size={18} aria-hidden />
        <span>Research Assistant</span>
      </div>

      <button type="button" className="btn btn--primary btn--md sidebar__new" onClick={() => { actions.reset(); onNavigate?.(); }}>
        <Plus size={16} aria-hidden /> New research
      </button>

      {view && state && (
        <>
          <div className="sidebar__project">
            <span className="eyebrow">Current project</span>
            <strong title={state.brief?.title || state.idea}>{state.brief?.title || state.idea}</strong>
            <span className="text-xs subtle">{PHASE[state.phase] || state.phase}{view.running ? " · working…" : ""}</span>
          </div>

          <div className="nav">
            <NavItem icon={MessageSquare} label="Chat" active={page === "chat"} onClick={() => go(paths.chat())}
              dot={!!view.pending && page !== "chat"} />
            <NavItem icon={LayoutDashboard} label="Project overview" active={page === "overview"} onClick={() => go(paths.overview())}
              dot={state.needs_reevaluation} />
          </div>

          <div className="nav">
            <span className="eyebrow nav__heading">Research library</span>
            <NavItem icon={FileText} label="Papers" count={state.papers?.length}
              active={(page === "library" && libTab === "papers") || page === "paper" || page === "compare"}
              onClick={() => go(paths.library("papers"))} />
            <NavItem icon={Database} label="Datasets" count={state.datasets?.length}
              active={(page === "library" && libTab === "datasets") || page === "dataset"}
              onClick={() => go(paths.library("datasets"))} />
          </div>

          <div className="nav">
            <NavItem icon={Lightbulb} label="Research gaps" count={gapsOf(state).length} active={page === "gaps"} onClick={() => go(paths.gaps())} />
            <NavItem icon={ListTree} label="Evidence map" active={page === "evidence"} onClick={() => go(paths.evidence())} />
            <NavItem icon={SquarePen} label="Report" active={page === "report"} onClick={() => go(paths.report())}
              dot={view.pending?.type === "report_review" && page !== "report"} />
            <NavItem icon={History} label="History" active={page === "history"} onClick={() => go(paths.history())} />
          </div>
        </>
      )}

      <div className="sidebar__recent">
        <span className="eyebrow nav__heading">Recent projects</span>
        {projects.length === 0 && <p className="text-xs subtle sidebar__hint">Projects are saved automatically.</p>}
        <ul>
          {projects.slice(0, 20).map((p) => (
            <li key={p.id}>
              <div className={`recent ${p.id === view?.thread_id ? "is-active" : ""}`}>
                <button type="button" className="recent__open" onClick={() => { actions.open(p.id); onNavigate?.(); }}
                  title={`${p.title || p.idea} · ${ago(p.updated_at)}`}>
                  <span className="recent__title">{p.title || p.idea}</span>
                  <span className="recent__meta">{PHASE[p.phase] || p.phase} · {ago(p.updated_at)}</span>
                </button>
                <button type="button" className="recent__delete" aria-label={`Delete ${p.title || p.idea}`} onClick={(e) => remove(e, p)}>
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar__footer">
        <NavItem icon={Settings} label="Settings" active={page === "settings"} onClick={() => go(paths.settings())} />
      </div>
    </nav>
  );
}
