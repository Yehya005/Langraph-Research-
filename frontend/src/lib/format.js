export const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export function ago(ts) {
  if (!ts) return "";
  const s = Date.now() / 1000 - ts;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

export const clock = (ts) => (ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

export function duration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export const authorsShort = (authors = []) =>
  !authors.length ? "Unknown authors" : authors.length > 2 ? `${authors[0]} et al.` : authors.join(", ");

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
