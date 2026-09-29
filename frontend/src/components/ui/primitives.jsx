import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { STATUS } from "../../lib/research.js";

/* ---- buttons ---------------------------------------------------------------------- */

export function Button({ variant = "secondary", size = "md", icon: Icon, children, className = "", ...rest }) {
  return (
    <button type="button" className={`btn btn--${variant} btn--${size} ${children ? "" : "btn--icon"} ${className}`} {...rest}>
      {Icon && <Icon size={size === "sm" ? 14 : 16} aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({ variant = "secondary", size = "md", icon: Icon, children, className = "", ...rest }) {
  return (
    <a className={`btn btn--${variant} btn--${size} ${className}`} {...rest}>
      {Icon && <Icon size={size === "sm" ? 14 : 16} aria-hidden />}
      {children}
    </a>
  );
}

/* ---- badges / tags ----------------------------------------------------------------- */

export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return <span className={`badge badge--${s.tone}`} title={s.hint}>{s.label}</span>;
}

export const Tag = ({ children, muted, title }) => <span className={`tag ${muted ? "tag--muted" : ""}`} title={title}>{children}</span>;

export function Score({ value, label }) {
  if (value == null) return null;
  const p = Math.round(value * 100);
  return (
    <span className="score" title={`${label}: ${p}%`}>
      <span className="score__bar"><span style={{ width: `${p}%` }} /></span>
      <span className="score__text">{p}%</span>
    </span>
  );
}

/* ---- states ------------------------------------------------------------------------ */

export function EmptyState({ icon: Icon, title, children, actions }) {
  return (
    <div className="empty">
      {Icon && <span className="empty__icon"><Icon size={20} aria-hidden /></span>}
      <h3 className="empty__title">{title}</h3>
      {children && <p className="empty__text">{children}</p>}
      {actions && <div className="empty__actions">{actions}</div>}
    </div>
  );
}

export const Spinner = ({ size = 14 }) => <LoaderCircle className="spin" size={size} aria-hidden />;

export function LoadingState({ label, lines = 3 }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading__label"><Spinner /> {label}</div>
      {Array.from({ length: lines }).map((_, i) => <div key={i} className="skeleton" style={{ width: `${92 - i * 14}%` }} />)}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry, children }) {
  return (
    <div className="error-box" role="alert">
      <CircleAlert size={16} aria-hidden />
      <div className="error-box__body">
        <strong>{title}</strong>
        {message && <p>{message}</p>}
        {(onRetry || children) && (
          <div className="row gap-2">
            {onRetry && <Button size="sm" icon={RotateCcw} onClick={onRetry}>Try again</Button>}
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- menu (dropdown) --------------------------------------------------------------- */

export function Menu({ label, icon, variant = "secondary", size = "md", align = "right", children, ...rest }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <Button variant={variant} size={size} icon={icon} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} {...rest}>
        {label} {label && <ChevronDown size={14} aria-hidden />}
      </Button>
      {open && (
        <div className={`menu__list menu__list--${align}`} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon: Icon, children, href, download, onClick, danger }) {
  const cls = `menu__item ${danger ? "menu__item--danger" : ""}`;
  const inner = <>{Icon && <Icon size={15} aria-hidden />}<span>{children}</span></>;
  return href
    ? <a role="menuitem" className={cls} href={href} download={download}>{inner}</a>
    : <button role="menuitem" type="button" className={cls} onClick={onClick}>{inner}</button>;
}

/* ---- tabs -------------------------------------------------------------------------- */

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id}
          className={`tabs__tab ${value === t.id ? "is-active" : ""}`} onClick={() => onChange(t.id)}>
          {t.icon && <t.icon size={15} aria-hidden />}{t.label}
          {t.count != null && <span className="tabs__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---- form controls ----------------------------------------------------------------- */

export function Select({ label, value, onChange, options }) {
  return (
    <label className="select">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} aria-hidden />
    </label>
  );
}

/* ---- markdown with clickable [n] citations ----------------------------------------- */

export function Markdown({ children, onCite }) {
  const cite = (node) => {
    if (typeof node !== "string" || !onCite) return node;
    return node.split(/(\[\d+\])/g).map((part, i) => {
      const n = part.match(/^\[(\d+)\]$/)?.[1];
      return n ? <button key={i} type="button" className="cite" onClick={() => onCite(Number(n))}>{part}</button> : part;
    });
  };
  const wrap = (Tag) => ({ children: c, node: _n, ...props }) =>
    <Tag {...props}>{Array.isArray(c) ? c.map((x, i) => <span key={i}>{cite(x)}</span>) : cite(c)}</Tag>;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}
      components={onCite ? { p: wrap("p"), li: wrap("li"), td: wrap("td") } : undefined}>
      {children}
    </ReactMarkdown>
  );
}
