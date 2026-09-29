import { useEffect, useRef, useState } from "react";
import { ArrowUp, Database, FileUp, Plus, Search, Telescope } from "lucide-react";
import { Button, Menu, MenuItem } from "../ui/primitives.jsx";

/** Bottom composer. `tools` enables the + menu (upload, search papers/datasets, deep research). */
export default function ChatComposer({ placeholder, onSend, disabled, tools, onUpload, quickReplies, onQuick, autoFocus }) {
  const [text, setText] = useState("");
  const ref = useRef(null);
  const file = useRef(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus, disabled]);

  const prefill = (t) => { setText(t); requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(t.length, t.length); }); };
  const send = () => { const t = text.trim(); if (!t || disabled) return; onSend(t); setText(""); };

  // grow with content, up to a limit
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  return (
    <div className="composer">
      {quickReplies?.length > 0 && (
        <div className="composer__quick">
          {quickReplies.map((q) => (
            <button key={q} type="button" className="suggestion" disabled={disabled} onClick={() => onQuick(q)}>{q}</button>
          ))}
        </div>
      )}
      <div className="composer__box">
        {tools && (
          <Menu icon={Plus} variant="ghost" align="left" aria-label="More actions">
            <MenuItem icon={FileUp} onClick={() => file.current?.click()}>Upload paper (PDF)</MenuItem>
            <MenuItem icon={Search} onClick={() => prefill("Find papers about ")}>Search papers</MenuItem>
            <MenuItem icon={Database} onClick={() => prefill("Find datasets for ")}>Search datasets</MenuItem>
            <MenuItem icon={Telescope} onClick={() => prefill("Run another research round focusing on ")}>Deep research</MenuItem>
          </Menu>
        )}
        <input ref={file} type="file" accept="application/pdf" hidden
          onChange={(e) => { onUpload?.(e.target.files[0]); e.target.value = ""; }} />
        <label className="sr-only" htmlFor="composer-input">{placeholder}</label>
        <textarea id="composer-input" ref={ref} rows={1} value={text} placeholder={placeholder} disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <Button variant="primary" icon={ArrowUp} aria-label="Send" disabled={disabled || !text.trim()} onClick={send} />
      </div>
    </div>
  );
}
