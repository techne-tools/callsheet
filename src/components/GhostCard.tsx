import type { Card as CardType } from "../tauri";
import { renderMarkdown } from "../markdown";

interface GhostCardProps {
  card: CardType;
  onCommit: () => void;
  onDismiss: () => void;
}

export default function GhostCard({ card, onCommit, onDismiss }: GhostCardProps) {
  return (
    <div className="ghost-card" role="button" tabIndex={0} onClick={onCommit}>
      <div className="ghost-card__head">
        <div className="ghost-card__label">Proposed</div>
        <button
          type="button"
          className="ghost-card__dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          title="Dismiss this proposal"
          aria-label="Dismiss proposal"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      </div>
      {/* Safe: renderMarkdown escapes HTML first (see src/markdown.ts; test-proven). */}
      <div
        dangerouslySetInnerHTML={{ __html: renderMarkdown(card.markdown) }}
      />
    </div>
  );
}
