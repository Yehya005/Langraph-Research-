/** Thin client for the FastAPI backend. Errors carry the server's `detail` message. */
async function call(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || `Request failed (${res.status})`);
    err.status = res.status;
    console.error(`[api] ${options.method || "GET"} ${path} -> ${res.status}`, body);
    throw err;
  }
  return res.json();
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });
const q = encodeURIComponent;

export const api = {
  config: () => call("/config"),
  create: (idea) => call("/sessions", json("POST", { idea })),
  get: (id, since = 0) => call(`/sessions/${id}?since=${since}`),
  resume: (id, value) => call(`/sessions/${id}/resume`, json("POST", { value })),
  retry: (id) => call(`/sessions/${id}/retry`, { method: "POST" }),
  chat: (id, message) => call(`/sessions/${id}/chat`, json("POST", { message })),
  history: (id) => call(`/sessions/${id}/history`),
  updateBrief: (id, brief) => call(`/sessions/${id}/brief`, json("PUT", { brief })),

  paperText: (id, paperId) => call(`/sessions/${id}/paper/text?paper_id=${q(paperId)}`),
  paperPdfUrl: (id, paperId) => `/api/sessions/${id}/paper/pdf?paper_id=${q(paperId)}`,
  summary: (id, paperId, refresh = false) => call(`/sessions/${id}/paper/summary?paper_id=${q(paperId)}&refresh=${refresh}`, { method: "POST" }),
  evaluate: (id, paperId) => call(`/sessions/${id}/paper/evaluate?paper_id=${q(paperId)}`, { method: "POST" }),
  upload: (id, file) => {
    const form = new FormData();
    form.append("file", file);
    return call(`/sessions/${id}/papers/upload`, { method: "POST", body: form });
  },
  compare: (id, paperIds) => call(`/sessions/${id}/compare`, json("POST", { paper_ids: paperIds })),
  ask: (id, body) => call(`/sessions/${id}/ask`, json("POST", body)),

  saveReport: (id, markdown) => call(`/sessions/${id}/report`, json("PUT", { markdown })),
  revertReport: (id, version) => call(`/sessions/${id}/report/revert`, json("POST", { version })),
  reportVersion: (id, version) => call(`/sessions/${id}/report/version?version=${version}`),
  reportUrl: (id, fmt = "md") => `/api/sessions/${id}/report.${fmt}`,

  projects: () => call("/projects"),
  openProject: (id) => call(`/projects/${id}/open`, { method: "POST" }),
  deleteProject: (id) => call(`/projects/${id}`, { method: "DELETE" }),
};
