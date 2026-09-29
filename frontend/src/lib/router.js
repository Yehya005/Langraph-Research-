import { useEffect, useState } from "react";

/** Minimal hash router: "#/library/papers" -> { page: "library", parts: ["papers"], query }.
 *  Hash routing keeps browser back/forward working without a router dependency. */
function parse() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, qs = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { page: parts[0] || "chat", parts: parts.slice(1), query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function navigate(path) {
  const target = `#/${path.replace(/^\/+/, "")}`;
  if (window.location.hash !== target) window.location.hash = target;
}

export const paths = {
  chat: () => "chat",
  overview: () => "overview",
  library: (tab = "papers") => `library/${tab}`,
  paper: (id, tab) => `paper/${encodeURIComponent(id)}${tab ? `?tab=${tab}` : ""}`,
  dataset: (id) => `dataset/${encodeURIComponent(id)}`,
  compare: (ids) => `compare?ids=${ids.map(encodeURIComponent).join(",")}`,
  gaps: (focus) => `gaps${focus != null ? `?focus=${focus}` : ""}`,
  evidence: () => "evidence",
  report: () => "report",
  history: () => "history",
  settings: () => "settings",
};
