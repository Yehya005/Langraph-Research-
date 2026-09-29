import { Menu as MenuIcon, Monitor, Moon, PanelRightClose, PanelRightOpen, Sun } from "lucide-react";
import { useSession } from "../../lib/session.jsx";
import { Button, Spinner } from "../ui/primitives.jsx";

const THEME_ICON = { auto: Monitor, light: Sun, dark: Moon };
const NEXT_THEME = { auto: "light", light: "dark", dark: "auto" };

/** Slim top bar: page title, what the team is doing right now, panel + theme toggles. */
export default function TopBar({ title, onMenu, panel, onTogglePanel, theme, onTheme }) {
  const { view, events } = useSession();
  const live = view?.running ? [...events].reverse().find((e) => e.run === view.run && e.kind === "status") : null;
  const ThemeIcon = THEME_ICON[theme];
  return (
    <header className="topbar">
      <Button variant="ghost" icon={MenuIcon} className="topbar__menu" aria-label="Open navigation" onClick={onMenu} />
      <h1 className="topbar__title">{title}</h1>
      <div className="topbar__status" aria-live="polite">
        {view?.running && <><Spinner /> <span>{live?.text || "Working…"}</span></>}
      </div>
      <div className="row gap-1">
        {panel !== undefined && (
          <Button variant="ghost" icon={panel ? PanelRightClose : PanelRightOpen}
            aria-label={panel ? "Hide side panel" : "Show side panel"} title={panel ? "Hide side panel" : "Show side panel"}
            onClick={onTogglePanel} />
        )}
        <Button variant="ghost" icon={ThemeIcon} aria-label={`Theme: ${theme}`} title={`Theme: ${theme} (click to change)`}
          onClick={() => onTheme(NEXT_THEME[theme])} />
      </div>
    </header>
  );
}
