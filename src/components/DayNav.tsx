interface DayNavProps {
  date: Date;
  onPrev: () => void;
  onNext: () => void;
  onAdd: () => void;
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
}: DayNavProps) {
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
        className="day-header__add"
        onClick={onAdd}
        aria-label="Add card"
        title="Add card"
      >
        +
      </button>
    </header>
  );
}
