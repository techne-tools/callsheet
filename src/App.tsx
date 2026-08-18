import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityType, Card, Template } from "./tauri";
import {
  listCards,
  saveCard,
  deleteCard,
  commitGhostCard,
  listActivityTypes,
  listTemplates,
  deriveBorder,
} from "./tauri";
import { markdownToPlainText } from "./markdown";
import CardView from "./components/Card";
import GhostCard from "./components/GhostCard";
import Sidebar from "./components/Sidebar";
import DayNav from "./components/DayNav";
import "./App.css";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export default function App() {
  const [date, setDate] = useState<Date>(() => new Date());
  const [cards, setCards] = useState<Card[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateKey = toISODate(date);
  const dayPaneRef = useRef<HTMLDivElement>(null);
  const dragIndexRef = useRef<number | null>(null);

  // Load activity types + templates once on mount.
  useEffect(() => {
    (async () => {
      try {
        const [types, tpls] = await Promise.all([
          listActivityTypes(),
          listTemplates(),
        ]);
        setActivityTypes(types);
        setTemplates(tpls);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  // Load cards for the selected day (day-scoped; no cross-day bleed).
  const loadCards = useCallback(async (key: string) => {
    try {
      const loaded = await listCards(key);
      setCards(loaded);
      setSelectedId(null);
      setEditingId(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void loadCards(dateKey);
  }, [dateKey, loadCards]);

  const typeById = useMemo(() => {
    const m = new Map<number, ActivityType>();
    for (const t of activityTypes) m.set(t.id, t);
    return m;
  }, [activityTypes]);

  const fillFor = (card: Card): string => {
    const t = typeById.get(card.activityTypeId);
    return t ? t.colour : "hsl(0, 0%, 93%)";
  };

  const borderFor = (card: Card): string => deriveBorder(fillFor(card));

  // Persist the full ordering of the current day (reindex positions 0..n).
  const persistOrder = useCallback(
    async (ordered: Card[]) => {
      const reindexed = ordered.map((c, i) => ({ ...c, position: i }));
      setCards(reindexed);
      for (const c of reindexed) {
        await saveCard({
          id: c.id,
          date: c.date,
          activityTypeId: c.activityTypeId,
          position: c.position,
          markdown: c.markdown,
          isGhost: c.isGhost,
        });
      }
    },
    [],
  );

  // Move the card at `fromIndex` to `toIndex` and persist.
  const reorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const next = [...cards];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      void persistOrder(next);
    },
    [cards, persistOrder],
  );

  const moveSelected = useCallback(
    (dir: -1 | 1) => {
      if (selectedId == null) return;
      const idx = cards.findIndex((c) => c.id === selectedId);
      if (idx < 0) return;
      const target = idx + dir;
      if (target < 0 || target >= cards.length) return;
      reorder(idx, target);
    },
    [cards, selectedId, reorder],
  );

  const saveMarkdown = useCallback(
    async (card: Card, markdown: string) => {
      try {
        const saved = await saveCard({
          id: card.id,
          date: card.date,
          activityTypeId: card.activityTypeId,
          position: card.position,
          markdown,
          isGhost: card.isGhost,
        });
        setCards((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  const handleDelete = useCallback(
    async (card: Card) => {
      try {
        await deleteCard(card.id);
        setCards((prev) => prev.filter((c) => c.id !== card.id));
        if (selectedId === card.id) setSelectedId(null);
      } catch (e) {
        setError(String(e));
      }
    },
    [selectedId],
  );

  const commitGhost = useCallback(
    async (card: Card) => {
      try {
        const committed = await commitGhostCard(card.id);
        setCards((prev) =>
          prev.map((c) => (c.id === committed.id ? committed : c)),
        );
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  // --- Clipboard -----------------------------------------------------------

  const copySelected = useCallback(async () => {
    if (selectedId == null) return;
    const card = cards.find((c) => c.id === selectedId);
    if (!card) return;
    await navigator.clipboard.writeText(markdownToPlainText(card.markdown));
  }, [cards, selectedId]);

  const cutSelected = useCallback(async () => {
    if (selectedId == null) return;
    const card = cards.find((c) => c.id === selectedId);
    if (!card) return;
    await navigator.clipboard.writeText(markdownToPlainText(card.markdown));
    await handleDelete(card);
  }, [cards, selectedId, handleDelete]);

  const pasteCard = useCallback(async () => {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    if (!text.trim()) return;
    const typeId =
      (selectedId != null
        ? cards.find((c) => c.id === selectedId)?.activityTypeId
        : undefined) ?? activityTypes[0]?.id;
    if (typeId == null) return;
    try {
      await saveCard({
        id: 0,
        date: dateKey,
        activityTypeId: typeId,
        position: cards.length,
        markdown: text,
        isGhost: false,
      });
      await loadCards(dateKey);
    } catch (e) {
      setError(String(e));
    }
  }, [cards, selectedId, activityTypes, dateKey, loadCards]);

  // --- Keyboard grammar ----------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Day nav: Cmd+Left / Cmd+Right
      if (mod && e.key === "ArrowLeft") {
        e.preventDefault();
        setDate((d) => addDays(d, -1));
        return;
      }
      if (mod && e.key === "ArrowRight") {
        e.preventDefault();
        setDate((d) => addDays(d, 1));
        return;
      }

      // Clipboard
      if (mod && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        void copySelected();
        return;
      }
      if (mod && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        void cutSelected();
        return;
      }
      if (mod && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        void pasteCard();
        return;
      }

      // Shift order: Cmd+Shift+Up / Down
      if (mod && e.shiftKey && e.key === "ArrowUp") {
        e.preventDefault();
        moveSelected(-1);
        return;
      }
      if (mod && e.shiftKey && e.key === "ArrowDown") {
        e.preventDefault();
        moveSelected(1);
        return;
      }

      // Enter edits the selected card
      if (e.key === "Enter" && !mod) {
        if (selectedId != null && editingId == null) {
          e.preventDefault();
          setEditingId(selectedId);
        }
        return;
      }

      // Tab / Shift+Tab navigate between cards
      if (e.key === "Tab") {
        if (editingId != null) return; // let textarea handle Tab normally
        e.preventDefault();
        setCards((prev) => {
          if (prev.length === 0) return prev;
          const idx = selectedId != null ? prev.findIndex((c) => c.id === selectedId) : -1;
          const nextIdx = e.shiftKey
            ? (idx - 1 + prev.length) % prev.length
            : (idx + 1) % prev.length;
          setSelectedId(prev[nextIdx].id);
          return prev;
        });
      }
    },
    [
      copySelected,
      cutSelected,
      pasteCard,
      moveSelected,
      selectedId,
      editingId,
    ],
  );

  // --- Drag & drop ---------------------------------------------------------

  const handleCardDragStart = useCallback(
    (e: React.DragEvent, card: Card) => {
      dragIndexRef.current = cards.findIndex((c) => c.id === card.id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(card.id));
    },
    [cards],
  );

  const handleTemplateDragStart = useCallback(
    (e: React.DragEvent, template: Template) => {
      dragIndexRef.current = null;
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("application/x-callsheet-template", String(template.id));
    },
    [],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dayPaneRef.current?.classList.remove("day-pane--over");

      const templateId = e.dataTransfer.getData("application/x-callsheet-template");
      if (templateId) {
        const tpl = templates.find((t) => t.id === Number(templateId));
        if (tpl) {
          try {
            await saveCard({
              id: 0,
              date: dateKey,
              activityTypeId: tpl.activityTypeId,
              position: cards.length,
              markdown: tpl.markdown,
              isGhost: false,
            });
            await loadCards(dateKey);
          } catch (err) {
            setError(String(err));
          }
        }
        return;
      }

      // Card reorder
      const from = dragIndexRef.current;
      if (from == null) return;
      const to = computeDropIndex(e);
      dragIndexRef.current = null;
      if (to != null && to !== from) reorder(from, to);
    },
    [templates, dateKey, cards, loadCards, reorder],
  );

  const computeDropIndex = (e: React.DragEvent): number | null => {
    const col = e.currentTarget as HTMLElement;
    const items = Array.from(col.querySelectorAll<HTMLElement>("[data-card-id]"));
    if (items.length === 0) return 0;
    const y = e.clientY;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return i;
    }
    return items.length;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dayPaneRef.current?.classList.add("day-pane--over");
  }, []);

  const handleDragLeave = useCallback(() => {
    dayPaneRef.current?.classList.remove("day-pane--over");
  }, []);

  // --- Render --------------------------------------------------------------

  return (
    <div className="app">
      <Sidebar
        templates={templates}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onTemplateDragStart={handleTemplateDragStart}
      />

      <div
        className="day-pane"
        ref={dayPaneRef}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        tabIndex={-1}
      >
        <DayNav
          date={date}
          canGoPrev
          canGoNext
          onPrev={() => setDate((d) => addDays(d, -1))}
          onNext={() => setDate((d) => addDays(d, 1))}
        />

        <div className="card-column">
          {error && (
            <div className="empty-day" role="alert">
              {error}
            </div>
          )}

          {!error && cards.length === 0 && (
            <div className="empty-day">A quiet day. No cards yet.</div>
          )}

          {!error && cards.length > 0 && (
            <div className="card-stack" role="list">
              {cards.map((card) => (
                <CardView
                  key={card.id}
                  card={card}
                  fill={fillFor(card)}
                  border={borderFor(card)}
                  selected={card.id === selectedId}
                  editing={card.id === editingId}
                  onSelect={() => setSelectedId(card.id)}
                  onEdit={() =>
                    setEditingId((cur) => (cur === card.id ? null : card.id))
                  }
                  onSave={(md) => void saveMarkdown(card, md)}
                  onDelete={() => void handleDelete(card)}
                  onGrabStart={(e) => handleCardDragStart(e, card)}
                />
              ))}

              {cards
                .filter((c) => c.isGhost)
                .map((g) => (
                  <GhostCard key={`ghost-${g.id}`} card={g} onCommit={() => void commitGhost(g)} />
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
