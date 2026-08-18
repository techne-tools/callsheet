import { useState } from "react";

interface DayNavProps {
  date: Date;
  onPrev: () => void;
  onNext: () => void;
  onAdd: () => void;
  onToday: () => void;
  onPropose: () => void;
  onSetPresence: (mode: "normal" | "statusbar" | "dock") => void;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
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
}: DayNavProps) {
  const [presenceOpen, setPresenceOpen] = useState(false);

  return (
    <header className="day-header">
      <button
        type="button"
        className="day-header__nav"
        onClick={onPrev}
        aria-label="Previous day"
        title="Previous day (Cmd+Left)"
      >
        ‹
      </button>
      <div className="day-header__date">{formatDate(date)}</div>
      <button
        type="button"
        className="day-header__nav"
        onClick={onNext}
        aria-label="Next day"
        title="Next day (Cmd+Right)"
      >
        ›
      </button>
      <button
        type="button"
        className="day-header__today"
        onClick={onToday}
        title="Today (Cmd+T)"
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
          </div>
        )}
      </div>
    </header>
  );
}
