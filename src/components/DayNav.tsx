interface DayNavProps {
  date: Date;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
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
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: DayNavProps) {
  return (
    <header className="day-header">
      <button
        type="button"
        className="day-header__nav"
        onClick={onPrev}
        disabled={!canGoPrev}
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
        disabled={!canGoNext}
        aria-label="Next day"
        title="Next day (Cmd+Right)"
      >
        ›
      </button>
    </header>
  );
}
