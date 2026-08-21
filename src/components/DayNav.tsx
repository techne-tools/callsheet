import { useState } from "react";
import { isMac, modLabel } from "../platform";

interface DayNavProps {
  date: Date;
  onPrev: () => void;
  onNext: () => void;
  onAdd: () => void;
  onToday: () => void;
  onPropose: () => void;
  onSetPresence: (mode: "normal" | "statusbar" | "dock") => void;
  onCycleTheme: () => void;
  theme: "system" | "light" | "dark";
}

function formatWeekday(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function formatDaynum(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function DayNav({
  date,
  onPrev,
  onNext,
  onAdd,
  onToday,
  onPropose,
  onSetPresence,
  onCycleTheme,
  theme,
}: DayNavProps) {
  const [presenceOpen, setPresenceOpen] = useState(false);

  const themeLabel =
    theme === "system" ? "Theme: system" : theme === "light" ? "Theme: light" : "Theme: dark";

  return (
    <header className="day-header">
      <div className="day-header__nav-group">
        <button
          type="button"
          className="day-header__nav"
          onClick={onPrev}
          aria-label="Previous day"
          title={`Previous day (${modLabel}+Left)`}
        >
          ‹
        </button>
        <button
          type="button"
          className="day-header__nav"
          onClick={onNext}
          aria-label="Next day"
          title={`Next day (${modLabel}+Right)`}
        >
          ›
        </button>
      </div>
      <div className="day-header__date">
        <span className="day-header__weekday">{formatWeekday(date)}</span>
        <span className="day-header__daynum">{formatDaynum(date)}</span>
      </div>
      <div className="day-header__tools">
        <button
          type="button"
          className="day-header__today"
          onClick={onToday}
          title={`Today (${modLabel}+T)`}
        >
          Today
        </button>
        <button
          type="button"
          className="day-header__add"
          onClick={onAdd}
          aria-label="Add card"
          title="Add card"
        >
          +
        </button>
        <button
          type="button"
          className="day-header__add day-header__add--ghost"
          onClick={onPropose}
          aria-label="Propose a ghost card"
          title="Propose a ghost card"
        >
          ◌
        </button>
        <button
          type="button"
          className="day-header__theme"
          onClick={onCycleTheme}
          aria-label={themeLabel}
          title={`${themeLabel} — click to cycle`}
        >
          {theme === "dark" ? "◐" : theme === "light" ? "☀" : "◑"}
        </button>
        <div className="day-header__presence">
          <button
            type="button"
            className="day-header__add"
            onClick={() => setPresenceOpen((v) => !v)}
            aria-label="Window presence"
            aria-expanded={presenceOpen}
            title="Window presence"
          >
            ⋯
          </button>
          {presenceOpen && (
            <div className="presence-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetPresence("normal");
                  setPresenceOpen(false);
                }}
              >
                Normal window
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetPresence("statusbar");
                  setPresenceOpen(false);
                }}
              >
                Hide to menu bar
              </button>
              {isMac && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSetPresence("dock");
                    setPresenceOpen(false);
                  }}
                >
                  Toggle dock
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
