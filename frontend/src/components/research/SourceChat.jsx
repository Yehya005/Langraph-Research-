import { useEffect, useRef, useState } from "react";
import { ArrowUp, Quote, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { useSession } from "../../lib/session.jsx";
import { Button, ErrorState, Markdown, Spinner } from "../ui/primitives.jsx";

const SUGGESTIONS = {
  paper: ["Why is this useful for my project?", "What methodology did they use?", "What dataset was used?", "What are the limitations?"],
  dataset: ["Why is this useful?", "Why did the Judge score it this way?", "What are its weaknesses?", "How would I use it?"],
  comparison: ["Which methods are common across these papers?", "Why do their results differ?", "Which one fits my project best?"],
  gap: ["Why is this a gap?", "How could I address it?", "Is this gap worth pursuing?"],
};

/** Conversation scoped to one source. The backend answers only from that source's material. */
export default function SourceChat({ source, prompt, attachment, compact }) {
  const { view } = useSession();
  const key = `${source.kind}:${[...source.ids].sort().join(",")}`;
  const [thread, setThread] = useState(() => view?.extras?.threads?.[key] || []);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const end = useRef(null);
  const lastPrompt = useRef(null);
  const input = useRef(null);
  const [attached, setAttached] = useState(null);
  useEffect(() => { if (attachment?.selection) { setAttached(attachment.selection); input.current?.focus(); } }, [attachment]);

  useEffect(() => { setThread(view?.extras?.threads?.[key] || []); setError(null); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [thread.length, sending]);

  const send = async (message, selection = null) => {
    if (!message.trim() || sending) return;
    setSending(true); setError(null);
    setThread((t) => [...t, { role: "user", content: message, selection }]);
    try {
      const res = await api.ask(view.thread_id, { kind: source.kind, ids: source.ids, message, selection });
      setThread(res.thread);
    } catch (e) {
      setError(e.message);
      setThread((t) => t.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  // requests from elsewhere (e.g. "Explain" on a selected passage in the reader)
  useEffect(() => {
    if (prompt && prompt.n !== lastPrompt.current) {
      lastPrompt.current = prompt.n;
      send(prompt.message, prompt.selection);
    }
  }, [prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => { e.preventDefault(); const m = text; setText(""); send(m, attached); setAttached(null); };

  return (
    <div className={`source-chat ${compact ? "source-chat--compact" : ""}`}>
      {source.title && <p className="source-chat__subject"><span className="eyebrow">Discussing</span>{source.title}</p>}
      <div className="source-chat__thread">
        {thread.length === 0 && !sending && (
          <div className="source-chat__suggest">
            <span className="text-xs subtle">Try asking</span>
            {(SUGGESTIONS[source.kind] || []).map((s) => (
              <button key={s} type="button" className="suggestion" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {thread.map((m, i) => (
          <div key={i} className={`smsg smsg--${m.role}`}>
            {m.selection && <blockquote className="smsg__quote"><Quote size={12} aria-hidden /> {m.selection.slice(0, 280)}{m.selection.length > 280 ? "…" : ""}</blockquote>}
            {m.role === "assistant" ? <Markdown>{m.content}</Markdown> : <p>{m.content}</p>}
          </div>
        ))}
        {sending && <div className="smsg smsg--assistant smsg--pending"><Spinner /> Reading the source…</div>}
        {error && <ErrorState title="The assistant could not answer" message={error} />}
        <div ref={end} />
      </div>
      {attached && (
        <div className="attachment">
          <Quote size={12} aria-hidden /><span>{attached.slice(0, 160)}{attached.length > 160 ? "…" : ""}</span>
          <button type="button" aria-label="Remove passage" onClick={() => setAttached(null)}><X size={12} /></button>
        </div>
      )}
      <form className="source-chat__composer" onSubmit={submit}>
        <label className="sr-only" htmlFor={`ask-${key}`}>Ask about this source</label>
        <textarea ref={input} id={`ask-${key}`} rows={2} value={text} placeholder="Ask about this source…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) submit(e); }} />
        <Button type="submit" variant="primary" icon={ArrowUp} aria-label="Send" disabled={!text.trim() || sending} />
      </form>
    </div>
  );
}
