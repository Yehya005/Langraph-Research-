import { X } from "lucide-react";
import { useSession } from "../../lib/session.jsx";
import { Button } from "../ui/primitives.jsx";
import SourceChat from "../research/SourceChat.jsx";

/** Main workspace + optional context panel. A pending "Ask AI" source overrides the page's default panel. */
export default function Workspace({ children, panel, panelTitle, open, onClose, wide }) {
  const { source, actions } = useSession();
  const showSource = !!source;
  const content = showSource ? <SourceChat source={source} /> : panel;
  const title = showSource ? "Ask about this source" : panelTitle;
  const visible = open && !!content;
  return (
    <div className={`workspace ${visible ? "has-panel" : ""}`}>
      <div className={`workspace__main ${wide ? "workspace__main--wide" : ""}`}>{children}</div>
      {visible && (
        <aside className="context" aria-label={title}>
          <div className="context__header">
            <h2 className="h3">{title}</h2>
            <Button variant="ghost" size="sm" icon={X} aria-label="Close panel"
              onClick={showSource ? actions.closeSource : onClose} />
          </div>
          <div className="context__body">{content}</div>
        </aside>
      )}
    </div>
  );
}
