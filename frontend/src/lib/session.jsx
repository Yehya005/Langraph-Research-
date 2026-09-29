import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { navigate } from "./router.js";

/** Per-browser conveniences only; storage can be unavailable (private mode), so never rely on it. */
export const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } },
};

const SessionContext = createContext(null);

// Before the first node writes to the graph (e.g. right after "create"), the state is almost empty.
// Normalizing here means no component has to guard against missing fields.
const EMPTY_STATE = {
  phase: "interview", idea: "", messages: [], papers: [], datasets: [], paper_verdicts: {}, dataset_verdicts: {},
  gaps: [], gap_details: [], log: [], project_changes: [], user_notes: [], references: [], search_queries: [],
  research_round: 0, report_version: 0, interview_turns: 0, brief: null, analysis: null, report_markdown: null,
};
const normalize = (v) => ({ ...v, chat: v.chat || [], extras: v.extras || {}, state: { ...EMPTY_STATE, ...v.state } });
export const useSession = () => useContext(SessionContext);

/** Owns the current project: polls the backend while the graph runs, merges live activity events,
 *  and exposes every action the UI can take. The backend (LangGraph state) is the source of truth. */
export function SessionProvider({ children }) {
  const [view, setViewRaw] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // label of a UI-initiated request in flight
  const [projects, setProjects] = useState([]);
  const [config, setConfig] = useState(null);
  const [source, setSource] = useState(null); // {kind, id, title} for the "Ask AI" context panel
  const threadRef = useRef(null);
  const eventsLen = useRef(0);
  const timer = useRef(null);

  // the server returns the full event list (events.length === events_total) or only new ones
  const setView = useCallback((raw) => {
    if (!raw) {
      setViewRaw(null); setEvents([]); eventsLen.current = 0; threadRef.current = null;
      return;
    }
    const v = normalize(raw);
    const full = v.events.length === v.events_total;
    if (v.thread_id !== threadRef.current || full) setEvents(v.events);
    else if (v.events.length) setEvents((prev) => [...prev, ...v.events]);
    eventsLen.current = v.events_total;
    threadRef.current = v.thread_id;
    setViewRaw(v);
  }, []);

  const refreshProjects = useCallback(() => api.projects().then(setProjects).catch(() => {}), []);

  useEffect(() => {
    refreshProjects();
    api.config().then(setConfig).catch(() => {});
    const id = store.get("ra_thread");
    if (id) api.openProject(id).then(setView).catch(() => store.set("ra_thread", null));
  }, [refreshProjects, setView]);

  useEffect(() => { store.set("ra_thread", view?.thread_id ?? null); }, [view?.thread_id]);

  // poll while the graph runs; refresh the project list when a run finishes
  const wasRunning = useRef(false);
  useEffect(() => {
    clearTimeout(timer.current);
    if (view?.running) {
      wasRunning.current = true;
      timer.current = setTimeout(async () => {
        try { setView(await api.get(view.thread_id, eventsLen.current)); } catch (e) { setError(e.message); }
      }, 1200);
    } else if (wasRunning.current) {
      wasRunning.current = false;
      refreshProjects();
    }
    return () => clearTimeout(timer.current);
  }, [view, setView, refreshProjects]);

  /** Run a request that returns a session view; `label` drives contextual loading states. */
  const run = useCallback(async (fn, label = null) => {
    setError(null);
    setBusy(label);
    try {
      const v = await fn();
      if (v?.thread_id) setView(v);
      return v;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(null);
    }
  }, [setView]);

  const id = view?.thread_id;
  const actions = useMemo(() => ({
    create: (idea) => run(() => api.create(idea), "Starting…").then(() => { navigate("chat"); refreshProjects(); }),
    // label disables approval cards / composer until the server has accepted the decision
    resume: (value) => run(() => api.resume(id, value), "Submitting…"),
    retry: () => run(() => api.retry(id)),
    chat: (message) => run(() => api.chat(id, message), "Thinking…"),
    updateBrief: (brief) => run(() => api.updateBrief(id, brief), "Saving project…"),
    saveReport: (md) => run(() => api.saveReport(id, md), "Saving report…"),
    revertReport: (version) => run(() => api.revertReport(id, version), "Restoring version…"),
    evaluate: (paperId) => run(() => api.evaluate(id, paperId), "The Judge is evaluating this paper…"),
    upload: async (file) => {
      const res = await run(() => api.upload(id, file).then((r) => r.view), "Processing PDF…");
      refreshProjects();
      return res;
    },
    open: (pid) => run(() => api.openProject(pid), "Opening project…").then(() => navigate("chat")),
    reset: () => { setView(null); setError(null); setSource(null); navigate("chat"); },
    remove: async (pid) => {
      await api.deleteProject(pid);
      if (pid === id) { setView(null); navigate("chat"); }
      refreshProjects();
    },
    reload: () => id && api.get(id, 0).then(setView),
    askAbout: (src) => setSource(src),
    closeSource: () => setSource(null),
    clearError: () => setError(null),
  }), [id, run, refreshProjects, setView]);

  const value = { view, state: view?.state, events, error, busy, projects, config, source, actions };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
