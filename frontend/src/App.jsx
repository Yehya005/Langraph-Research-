import { useEffect, useState } from "react";
import { SessionProvider, store, useSession } from "./lib/session.jsx";
import { useRoute } from "./lib/router.js";
import Sidebar from "./components/layout/Sidebar.jsx";
import TopBar from "./components/layout/TopBar.jsx";
import { ErrorState } from "./components/ui/primitives.jsx";
import ChatWorkspace from "./components/chat/ChatWorkspace.jsx";
import ResearchLibrary from "./components/research/ResearchLibrary.jsx";
import PaperReader from "./components/research/PaperReader.jsx";
import DatasetDetail from "./components/research/DatasetDetail.jsx";
import PaperComparison from "./components/research/PaperComparison.jsx";
import ResearchGaps from "./components/research/ResearchGaps.jsx";
import EvidenceMap from "./components/research/EvidenceMap.jsx";
import ProjectOverview from "./components/project/ProjectOverview.jsx";
import HistoryTimeline from "./components/project/HistoryTimeline.jsx";
import Settings from "./components/project/Settings.jsx";
import ReportWorkspace from "./components/report/ReportWorkspace.jsx";

const TITLES = {
  chat: "Chat", overview: "Project overview", library: "Research library", paper: "Paper", dataset: "Dataset",
  compare: "Compare papers", gaps: "Research gaps", evidence: "Evidence map", report: "Report", history: "History", settings: "Settings",
};
const NEEDS_PROJECT = new Set(["overview", "library", "paper", "dataset", "compare", "gaps", "evidence", "report", "history"]);

function useTheme() {
  const [theme, setTheme] = useState(() => store.get("ra_theme") || "auto");
  useEffect(() => {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    store.set("ra_theme", theme);
  }, [theme]);
  return [theme, setTheme];
}

function Shell() {
  const route = useRoute();
  const { view, source, error, actions } = useSession();
  const [theme, setTheme] = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => store.get("ra_panel") !== "closed" && window.innerWidth > 1100);
  useEffect(() => { store.set("ra_panel", panelOpen ? "open" : "closed"); }, [panelOpen]);
  useEffect(() => { if (source) setPanelOpen(true); }, [source]);
  useEffect(() => { setNavOpen(false); }, [route.page]);

  const page = view || !NEEDS_PROJECT.has(route.page) ? route.page : "chat";
  const panel = { panelOpen, onClosePanel: () => { setPanelOpen(false); actions.closeSource(); } };

  let content;
  switch (page) {
    case "overview": content = <ProjectOverview {...panel} />; break;
    case "library": content = <ResearchLibrary tab={route.parts[0] === "datasets" ? "datasets" : "papers"} {...panel} />; break;
    case "paper": content = <PaperReader key={route.parts[0]} paperId={route.parts[0]} tab={route.query.tab || "read"} {...panel} />; break;
    case "dataset": content = <DatasetDetail datasetId={route.parts[0]} {...panel} />; break;
    case "compare": content = <PaperComparison ids={(route.query.ids || "").split(",").filter(Boolean)} />; break;
    case "gaps": content = <ResearchGaps focus={route.query.focus} {...panel} />; break;
    case "evidence": content = <EvidenceMap {...panel} />; break;
    case "report": content = <ReportWorkspace {...panel} />; break;
    case "history": content = <HistoryTimeline {...panel} />; break;
    case "settings": content = <Settings theme={theme} onTheme={setTheme} />; break;
    default: content = <ChatWorkspace {...panel} />;
  }
  const hasPanel = view && !["compare", "settings"].includes(page);

  return (
    <div className={`shell ${navOpen ? "nav-open" : ""}`}>
      <Sidebar route={{ ...route, page }} onNavigate={() => setNavOpen(false)} />
      {navOpen && <button type="button" className="scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
      <div className="main">
        <TopBar title={TITLES[page] || "Research Assistant"} onMenu={() => setNavOpen(true)}
          panel={hasPanel ? panelOpen : undefined} onTogglePanel={() => setPanelOpen(!panelOpen)}
          theme={theme} onTheme={setTheme} />
        {error && page !== "chat" && (
          <div className="banner"><ErrorState title="That didn't work" message={error}>
            <button type="button" className="link-btn" onClick={actions.clearError}>Dismiss</button></ErrorState></div>
        )}
        {content}
      </div>
    </div>
  );
}

export default function App() {
  return <SessionProvider><Shell /></SessionProvider>;
}
