import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ActivityType, Card, Template } from "./tauri";
import {
  listCards,
  saveCard,
  deleteCard,
  reorderCards,
  commitGhostCard,
  proposeGhostCard,
  listActivityTypes,
  createActivityType,
  deleteActivityType,
  listTemplates,
  createTemplate,
  deleteTemplate,
  updateTemplate,
  setWindowPresence,
  deriveBorder,
} from "./tauri";
import { markdownToPlainText, templateNameFromMarkdown } from "./markdown";
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

function calmError(e: unknown, context: string): { message: string; sticky: boolean } {
  console.error(`[callsheet] ${context} failed:`, e);
  // Sticky (outcome-bearing) failures — delete, delete-type — leave the board
  // ambiguous (card still there / type still in use), so they must stay until
  // dismissed. Transient ones (save / load) auto-clear after a moment.
  const sticky = context === "delete" || context === "delete-type";
  switch (context) {
    case "save":
      return { message: "Couldn't save this card. It's still here — try again.", sticky };
    case "delete":
      return { message: "Couldn't delete that card. Try again.", sticky };
    case "delete-type":
      return {
        message:
          "Couldn't delete that activity type. If it's still in use by a card or template, remove it from those first.",
        sticky,
      };
    case "load":
      return { message: "Couldn't load this day. Try again.", sticky };
    default:
      return { message: "Something went wrong. Try again.", sticky };
  }
}

export default function App() {
  const [date, setDate] = useState<Date>(() => new Date());
  const [cards, setCards] = useState<Card[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState<{ message: string; sticky: boolean } | null>(null);
  const [lastDeleted, setLastDeleted] = useState<Card | null>(null);

  const dateKey = toISODate(date);
  const dayPaneRef = useRef<HTMLDivElement>(null);
  const requestedKeyRef = useRef<string>("");
  const lastInteractionRef = useRef<number>(Date.now());

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
        setError(calmError(e, "load"));
      }
    })();
  }, []);

  // Load cards for the selected day (day-scoped; no cross-day bleed).
  const loadCards = useCallback(async (key: string) => {
    requestedKeyRef.current = key;
    try {
      const loaded = await listCards(key);
      if (requestedKeyRef.current !== key) return; // stale response, ignore
      setCards(loaded);
      setSelectedId(null);
      setEditingId(null);
    } catch (e) {
      setError(calmError(e, "load"));
    }
  }, []);

  useEffect(() => {
    void loadCards(dateKey);
  }, [dateKey, loadCards]);

  // The agent layer writes cards directly to the store. `cards-changed` is the
  // app's only wake-up signal — silent, no toast, no flash. Reload the current
  // day so proposals appear without the user asking.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const un = await listen("cards-changed", () => {
        if (!cancelled) void loadCards(dateKeyRef.current);
      });
      if (cancelled) un();
      else unlisten = un;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [loadCards]);

  // Slow fallback poll: if the agent wrote directly and the event was missed
  // (e.g. the app was asleep), quietly re-sync while the window is visible.
  // Presence, not pressure — 30s, no UI, cleared on unmount.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadCards(dateKeyRef.current);
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [loadCards]);

  // Track the last user interaction so the day can advance only when the
  // board is idle — never while someone is working on a day.
  useEffect(() => {
    const mark = () => {
      lastInteractionRef.current = Date.now();
    };
    window.addEventListener("pointerdown", mark);
    window.addEventListener("keydown", mark);
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);

  // Advance to the current day when the board is idle: at midnight, or after
  // 15 minutes without interaction while the window is visible. Quiet — the
  // date just moves; no toast, no flash. Cmd+T still jumps back manually.
  useEffect(() => {
    const advanceIfIdle = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInteractionRef.current < 15 * 60_000) return;
      setDate((d) => {
        const today = new Date();
        return toISODate(d) === toISODate(today) ? d : today;
      });
    };
    const id = window.setInterval(advanceIfIdle, 60_000);
    return () => window.clearInterval(id);
  }, []);

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
      try {
        const saved = await reorderCards(dateKey, reindexed.map((c) => c.id));
        setCards(saved);
      } catch (e) {
        setError(calmError(e, "save"));
      }
    },
    [dateKey],
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
        setError(calmError(e, "save"));
      }
    },
    [],
  );

  const handleDelete = useCallback(
    async (card: Card) => {
      try {
        await deleteCard(card.id);
        setLastDeleted(card);
        setCards((prev) => prev.filter((c) => c.id !== card.id));
        if (selectedId === card.id) setSelectedId(null);
      } catch (e) {
        setError(calmError(e, "delete"));
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
        setError(calmError(e, "save"));
      }
    },
    [],
  );

  // --- Add / template management ------------------------------------------

  const addCard = useCallback(async () => {
    const typeId =
      (selectedId != null
        ? cards.find((c) => c.id === selectedId)?.activityTypeId
        : undefined) ?? activityTypes[0]?.id;
    if (typeId == null) return;
    try {
      const saved = await saveCard({
        id: 0,
        date: dateKey,
        activityTypeId: typeId,
        position: cards.filter((c) => !c.isGhost).length,
        markdown: "",
        isGhost: false,
      });
      setCards((prev) => [...prev, saved]);
      setSelectedId(saved.id);
      setEditingId(saved.id);
    } catch (e) {
      setError(calmError(e, "save"));
    }
  }, [cards, selectedId, activityTypes, dateKey]);

  const saveAsTemplate = useCallback(
    async (card: Card, markdown: string) => {
      try {
        const tpl = await createTemplate(
          templateNameFromMarkdown(markdown),
          markdown,
          card.activityTypeId,
        );
        setTemplates((prev) => [...prev, tpl]);
      } catch (e) {
        setError(calmError(e, "save"));
      }
    },
    [],
  );

  const removeTemplate = useCallback(async (id: number) => {
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(calmError(e, "delete"));
    }
  }, []);

  const saveTemplateEdit = useCallback(
    async (id: number, name: string, markdown: string, activityTypeId: number) => {
      try {
        const updated = await updateTemplate(id, name, markdown, activityTypeId);
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } catch (e) {
        setError(calmError(e, "save"));
      }
    },
    [],
  );

  // Sidebar "+": add a new empty template (edit it via double-click).
  const addEmptyTemplate = useCallback(async () => {
    const typeId = activityTypes[0]?.id;
    if (typeId == null) return;
    try {
      const tpl = await createTemplate("Untitled", "", typeId);
      setTemplates((prev) => [...prev, tpl]);
    } catch (e) {
      setError(calmError(e, "save"));
    }
  }, [activityTypes]);

  // --- Activity type management -------------------------------------------

  const addActivityType = useCallback(async (name: string) => {
    try {
      const t = await createActivityType(name);
      setActivityTypes((prev) => [...prev, t]);
    } catch (e) {
      setError(calmError(e, "save"));
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  // Auto-clear transient errors after 6s so a stale message can't linger
  // over the day's cards. Outcome-bearing (sticky) failures — delete,
  // delete-type — stay until dismissed: the board is ambiguous until the
  // user has seen and acted on them. Manual dismiss is always available.
  useEffect(() => {
    if (error == null || error.sticky) return;
    const t = setTimeout(dismissError, 6000);
    return () => clearTimeout(t);
  }, [error, dismissError]);

  const removeActivityType = useCallback(async (id: number) => {
    try {
      await deleteActivityType(id);
      setActivityTypes((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(calmError(e, "delete-type"));
    }
  }, []);

  // --- Window presence -----------------------------------------------------

  const setPresence = useCallback(
    async (mode: "normal" | "statusbar" | "dock") => {
      try {
        await setWindowPresence(mode);
      } catch (e) {
        setError(calmError(e, "load"));
      }
    },
    [],
  );

  // --- Ghost proposal (agent layer placeholder) ----------------------------
  // The agent (Hermes/Noema) will propose cards by writing isGhost rows. Until
  // that layer is wired, this manual affordance creates a demonstrable ghost
  // card so the presence is visible and testable.

  const proposeGhost = useCallback(async () => {
    const typeId = activityTypes[0]?.id;
    if (typeId == null) return;
    try {
      await proposeGhostCard(dateKey, typeId, "**A quiet** suggestion.", "manual");
      await loadCards(dateKey);
    } catch (e) {
      setError(calmError(e, "save"));
    }
  }, [activityTypes, dateKey, loadCards]);

  // --- Card type re-shade --------------------------------------------------

  const changeCardType = useCallback(
    async (card: Card, typeId: number) => {
      try {
        const saved = await saveCard({
          id: card.id,
          date: card.date,
          activityTypeId: typeId,
          position: card.position,
          markdown: card.markdown,
          isGhost: card.isGhost,
        });
        setCards((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      } catch (e) {
        setError(calmError(e, "save"));
      }
    },
    [],
  );

  // --- Clipboard -----------------------------------------------------------

  const copySelected = useCallback(async () => {
    if (selectedId == null) return;
    const card = cards.find((c) => c.id === selectedId);
    if (!card) return;
    try {
      await navigator.clipboard.writeText(markdownToPlainText(card.markdown));
    } catch (e) {
      setError(calmError(e, "save"));
    }
  }, [cards, selectedId]);

  const cutSelected = useCallback(async () => {
    if (selectedId == null) return;
    const card = cards.find((c) => c.id === selectedId);
    if (!card) return;
    try {
      await navigator.clipboard.writeText(markdownToPlainText(card.markdown));
    } catch (e) {
      setError(calmError(e, "save"));
      return;
    }
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
        position: cards.filter((c) => !c.isGhost).length,
        markdown: text,
        isGhost: false,
      });
      await loadCards(dateKey);
    } catch (e) {
      setError(calmError(e, "save"));
    }
  }, [cards, selectedId, activityTypes, dateKey, loadCards]);

  // --- Keyboard grammar ----------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // While a card is being edited inline, the editor owns the keyboard
      // (Enter/Backspace/Tab/Delete are content operations). Only Cmd-based
      // shortcuts still apply — except clipboard (Cmd+C/X/V) and undo
      // (Cmd+Z), which the editor must handle natively.
      if (editingId != null) {
        if (!mod) return;
        // The editor owns clipboard + undo while editing.
        if (["c", "C", "x", "X", "v", "V", "z", "Z"].includes(e.key)) return;
      }

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

      // Today: Cmd+T jumps back to the current day
      if (mod && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        setDate(new Date());
        return;
      }

      // Undo delete: Cmd+Z restores the last deleted card
      if (mod && (e.key === "z" || e.key === "Z")) {
        if (lastDeleted == null) return;
        e.preventDefault();
        void (async () => {
          try {
            await saveCard({
              id: 0,
              date: lastDeleted.date,
              activityTypeId: lastDeleted.activityTypeId,
              position: lastDeleted.position,
              markdown: lastDeleted.markdown,
              isGhost: lastDeleted.isGhost,
            });
            setLastDeleted(null);
            await loadCards(dateKey);
          } catch (err) {
            setError(calmError(err, "save"));
          }
        })();
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

      // Delete selected card: Backspace or Delete (not while editing)
      if (!mod && (e.key === "Backspace" || e.key === "Delete")) {
        if (editingId != null) return; // let the textarea handle it
        if (selectedId == null) return;
        e.preventDefault();
        const card = cards.find((c) => c.id === selectedId);
        if (card) void handleDelete(card);
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
        if (selectedId == null) return; // let Tab do normal focus traversal when no card is selected
        e.preventDefault();
        const idx = cards.findIndex((c) => c.id === selectedId);
        const nextIdx = e.shiftKey
          ? (idx - 1 + cards.length) % cards.length
          : (idx + 1) % cards.length;
        setSelectedId(cards[nextIdx].id);
      }
    },
    [
      copySelected,
      cutSelected,
      pasteCard,
      moveSelected,
      selectedId,
      editingId,
      lastDeleted,
      loadCards,
      dateKey,
      handleDelete,
      cards,
    ],
  );

  // --- Pointer drag (WKWebView does not fire HTML5 drag events reliably) ----
  // HTML5 DnD (draggable + dragstart/dragover/drop) is unreliable in Tauri's
  // WKWebView: drag events never fire, so drops fail silently. We implement
  // dragging with plain mouse events instead: mousedown arms a drag, a small
  // movement threshold activates it, mousemove updates the ghost + drop
  // indicator, mouseup resolves the drop.

  const dragRef = useRef<{
    kind: "card" | "template";
    id: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dayOver, setDayOver] = useState(false);

  const DRAG_THRESHOLD = 4; // px of movement before a drag begins

  const beginDrag = useCallback(
    (kind: "card" | "template", id: number, e: React.MouseEvent) => {
      e.preventDefault(); // stop text selection while dragging
      dragRef.current = { kind, id, startX: e.clientX, startY: e.clientY, active: false };
    },
    [],
  );

  const computeDropIndexAt = useCallback((y: number): number | null => {
    const col = dayPaneRef.current?.querySelector(".card-stack");
    if (!col) return null;
    const items = Array.from(col.querySelectorAll<HTMLElement>("[data-card-id]"));
    if (items.length === 0) return 0;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return i;
    }
    return items.length;
  }, []);

  // Latest data for the window-level drag handlers (avoids stale closures).
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const templatesRef = useRef(templates);
  templatesRef.current = templates;
  const dateKeyRef = useRef(dateKey);
  dateKeyRef.current = dateKey;
  const loadCardsRef = useRef(loadCards);
  loadCardsRef.current = loadCards;
  const reorderRef = useRef(reorder);
  reorderRef.current = reorder;
  const saveAsTemplateRef = useRef(saveAsTemplate);
  saveAsTemplateRef.current = saveAsTemplate;

  // Window-level mousemove/mouseup drive the drag once armed.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.active = true;
      }
      setDragPos({ x: e.clientX, y: e.clientY });
      if (d.kind === "card") {
        setDropIndex(computeDropIndexAt(e.clientY));
      }
      const under = document.elementFromPoint(e.clientX, e.clientY);
      setDayOver(!!under?.closest(".day-pane"));
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragPos(null);
      setDropIndex(null);
      setDayOver(false);
      if (!d || !d.active) return;

      const under = document.elementFromPoint(e.clientX, e.clientY);
      const inDayPane = !!under?.closest(".day-pane");
      const inSidebar = !!under?.closest(".sidebar, .sidebar-rail");

      if (d.kind === "template") {
        if (inDayPane) {
          const tpl = templatesRef.current.find((t) => t.id === d.id);
          if (tpl) {
            void (async () => {
              try {
                await saveCard({
                  id: 0,
                  date: dateKeyRef.current,
                  activityTypeId: tpl.activityTypeId,
                  position: cardsRef.current.filter((c) => !c.isGhost).length,
                  markdown: tpl.markdown,
                  isGhost: false,
                });
                await loadCardsRef.current(dateKeyRef.current);
              } catch (err) {
                setError(calmError(err, "save"));
              }
            })();
          }
        }
        return;
      }

      // Card drag: sidebar → save as template; day pane → reorder.
      if (inSidebar) {
        const card = cardsRef.current.find((c) => c.id === d.id);
        if (card) void saveAsTemplateRef.current(card, card.markdown);
        return;
      }
      if (inDayPane) {
        const from = cardsRef.current.findIndex((c) => c.id === d.id);
        const to = computeDropIndexAt(e.clientY);
        if (from >= 0 && to != null && to !== from) reorderRef.current(from, to);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [computeDropIndexAt]);

  // The dragged card/template content for the floating ghost.
  const dragGhost = useMemo(() => {
    if (!dragPos) return null;
    const d = dragRef.current;
    if (!d) return null;
    if (d.kind === "card") {
      const card = cards.find((c) => c.id === d.id);
      return card ? { x: dragPos.x, y: dragPos.y, text: markdownToPlainText(card.markdown) } : null;
    }
    const tpl = templates.find((t) => t.id === d.id);
    return tpl ? { x: dragPos.x, y: dragPos.y, text: tpl.name } : null;
  }, [dragPos, cards, templates]);

  // --- Render --------------------------------------------------------------

  return (
    <div className="app">
      <Sidebar
        templates={templates}
        activityTypes={activityTypes}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onTemplateDragStart={(e, t) => beginDrag("template", t.id, e)}
        onDeleteTemplate={(id) => void removeTemplate(id)}
        onAddTemplate={() => void addEmptyTemplate()}
        onUpdateTemplate={(id, name, md, typeId) =>
          void saveTemplateEdit(id, name, md, typeId)
        }
        onCreateActivityType={(name) => void addActivityType(name)}
        onDeleteActivityType={(id) => void removeActivityType(id)}
      />

      <div
        className={`day-pane${dayOver ? " day-pane--over" : ""}`}
        ref={dayPaneRef}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <DayNav
          date={date}
          onPrev={() => setDate((d) => addDays(d, -1))}
          onNext={() => setDate((d) => addDays(d, 1))}
          onAdd={() => void addCard()}
          onToday={() => setDate(new Date())}
          onPropose={() => void proposeGhost()}
          onSetPresence={(mode) => void setPresence(mode)}
        />

        <div className="card-column">
          {error && (
            <div
              className="error-banner"
              role="alert"
              data-sticky={error.sticky || undefined}
            >
              <span className="error-banner__text">{error.message}</span>
              <button
                type="button"
                className="error-banner__dismiss"
                onClick={dismissError}
                aria-label="Dismiss error"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {cards.length === 0 && (
            <div className="empty-day">
              <div className="empty-day__mark" aria-hidden="true">
                ◌
              </div>
              A quiet day. No cards yet.
              <div className="empty-day__hint">
                Add a card with the + button, or Cmd+V to paste · Tab to move
                between cards
              </div>
            </div>
          )}

          {cards.length > 0 && (
            <div className="card-stack" role="list">
              {cards
                .filter((c) => !c.isGhost)
                .map((card, i) => (
                  <div key={card.id} className="card-slot">
                    {dropIndex === i && (
                      <div className="drop-indicator" aria-hidden="true" />
                    )}
                    <CardView
                      card={card}
                      fill={fillFor(card)}
                      border={borderFor(card)}
                      activityTypes={activityTypes}
                      selected={card.id === selectedId}
                      editing={card.id === editingId}
                      onSelect={() => setSelectedId(card.id)}
                      onEdit={() =>
                        setEditingId((cur) => (cur === card.id ? null : card.id))
                      }
                      onSave={(md) => void saveMarkdown(card, md)}
                      onDelete={() => void handleDelete(card)}
                      onGrabStart={(e) => beginDrag("card", card.id, e)}
                      onTypeChange={(typeId) => void changeCardType(card, typeId)}
                    />
                  </div>
                ))}
              {dropIndex === cards.filter((c) => !c.isGhost).length && (
                <div className="drop-indicator" aria-hidden="true" />
              )}

              {cards
                .filter((c) => c.isGhost)
                .map((g) => (
                  <GhostCard
                    key={`ghost-${g.id}`}
                    card={g}
                    onCommit={() => void commitGhost(g)}
                    onDismiss={() => void handleDelete(g)}
                  />
                ))}
            </div>
          )}
        </div>
      </div>

      {dragGhost && (
        <div
          className="drag-ghost"
          style={{ left: dragGhost.x + 12, top: dragGhost.y + 12 }}
          aria-hidden="true"
        >
          {dragGhost.text}
        </div>
      )}
    </div>
  );
}
