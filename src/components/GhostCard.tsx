import type { Card as CardType } from "../tauri";
import { renderMarkdown } from "../markdown";

interface GhostCardProps {
  card: CardType;
  onCommit: () => void;
}

export default function GhostCard({ card, onCommit }: GhostCardProps) {
  return (
    <button
      type="button"
      className="ghost-card"
      onClick={onCommit}
      title="Commit this proposal"
    >
      <div className="ghost-card__label">Proposed</div>
      {/* Safe: renderMarkdown escapes HTML first (see src/markdown.ts; test-proven). */}
      <div
        dangerouslySetInnerHTML={{ __html: renderMarkdown(card.markdown) }}
      />
    </button>
  );
}
