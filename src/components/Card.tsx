import { useEffect, useRef, useState } from "react";
import type { Card as CardType } from "../tauri";
import { renderMarkdown } from "../markdown";

interface CardProps {
  card: CardType;
  fill: string;
  border: string;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onSave: (markdown: string) => void;
  onDelete: () => void;
  onGrabStart: (e: React.DragEvent) => void;
}

export default function Card({
  card,
  fill,
  border,
  selected,
  editing,
  onSelect,
  onEdit,
  onSave,
  onDelete,
  onGrabStart,
}: CardProps) {
  const [draft, setDraft] = useState(card.markdown);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When entering edit mode, load the current markdown and focus.
  useEffect(() => {
    if (editing) {
      setDraft(card.markdown);
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }, [editing, card.markdown]);

  const commit = () => {
    if (editing && draft !== card.markdown) {
      onSave(draft);
    }
    onEdit(); // blur exits edit mode
  };

  return (
    <div
      className={`card${selected ? " card--selected" : ""}`}
      style={{ background: fill, borderColor: border }}
      onClick={onSelect}
      onDoubleClick={onEdit}
      role="listitem"
      tabIndex={0}
      data-card-id={card.id}
    >
      <div
        className="card__grab"
        draggable
        onDragStart={onGrabStart}
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden="true">
          <circle cx="2" cy="2" r="1.3" />
          <circle cx="6" cy="2" r="1.3" />
          <circle cx="2" cy="7" r="1.3" />
          <circle cx="6" cy="7" r="1.3" />
          <circle cx="2" cy="12" r="1.3" />
          <circle cx="6" cy="12" r="1.3" />
        </svg>
      </div>

      <div className="card__body">
        {editing ? (
          <textarea
            ref={textareaRef}
            className="card__edit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            spellCheck={false}
          />
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: renderMarkdown(card.markdown) }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && (card.markdown === "" || selected)) {
                e.preventDefault();
                onDelete();
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
