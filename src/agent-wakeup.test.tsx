// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import App from "./App";
import type { ActivityType } from "./tauri";

// React 19 requires this global for act() to run without warnings.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const researchType: ActivityType = {
  id: 1,
  name: "Research",
  colour: "hsl(215, 15%, 93%)",
  isSeed: true,
};

const mocks = vi.hoisted(() => ({
  listCards: vi.fn(),
  listActivityTypes: vi.fn(),
  listTemplates: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  cardsChangedHandler: undefined as ((e: unknown) => void) | undefined,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listen,
}));

vi.mock("./tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tauri")>();
  return {
    ...actual,
    listCards: mocks.listCards,
    listActivityTypes: mocks.listActivityTypes,
    listTemplates: mocks.listTemplates,
  };
});

function renderApp(): Root {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<App />);
  });
  return root;
}

beforeEach(() => {
  mocks.listCards.mockReset();
  mocks.listActivityTypes.mockReset();
  mocks.listTemplates.mockReset();
  mocks.listen.mockReset();
  mocks.unlisten.mockReset();
  mocks.cardsChangedHandler = undefined;

  mocks.listCards.mockResolvedValue([]);
  mocks.listActivityTypes.mockResolvedValue([researchType]);
  mocks.listTemplates.mockResolvedValue([]);
  mocks.listen.mockImplementation(async (_event: string, cb: (e: unknown) => void) => {
    mocks.cardsChangedHandler = cb;
    return mocks.unlisten;
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  // Restore matchMedia + localStorage so tests don't leak into each other.
  vi.restoreAllMocks();
  try {
    localStorage.removeItem("callsheet-theme");
  } catch {
    /* storage unavailable */
  }
});

/** Force the OS dark-preference media query to a fixed answer. */
function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

describe("agent wake-up (Phase B)", () => {
  it("reloads the current day when cards-changed fires", async () => {
    const root = renderApp();
    await act(async () => {}); // flush listen registration + initial load

    expect(mocks.listen).toHaveBeenCalledWith("cards-changed", expect.any(Function));
    expect(mocks.listCards).toHaveBeenCalledTimes(1);

    await act(async () => {
      mocks.cardsChangedHandler?.({});
    });

    expect(mocks.listCards).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it("polls every 30s while the window is visible", async () => {
    vi.useFakeTimers();
    const root = renderApp();
    await act(async () => {}); // flush initial load

    const before = mocks.listCards.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(mocks.listCards.mock.calls.length).toBe(before + 1);
    act(() => root.unmount());
  });

  it("cleans up the listener and interval on unmount", async () => {
    const root = renderApp();
    await act(async () => {});

    act(() => root.unmount());

    expect(mocks.unlisten).toHaveBeenCalled();
  });

  it("renders a ghost card once — as a proposal, not a real card", async () => {
    mocks.listCards.mockResolvedValue([
      {
        id: 7,
        date: "2026-08-18",
        activityTypeId: 1,
        position: 0,
        markdown: "A quiet suggestion.",
        isGhost: true,
        source: "agent",
      },
    ]);
    const root = renderApp();
    await act(async () => {});

    // The ghost must appear exactly once, as a GhostCard (dashed proposal),
    // never as a real CardView duplicate.
    expect(document.querySelectorAll(".ghost-card").length).toBe(1);
    expect(document.querySelectorAll(".card").length).toBe(0);
    act(() => root.unmount());
  });
});

describe("dark theme colour resolution (Phase B.3)", () => {
  it("in system mode with a dark OS, cards resolve to a dark fill (not light pastel)", async () => {
    stubMatchMedia(true); // OS prefers dark
    mocks.listCards.mockResolvedValue([
      {
        id: 5,
        date: "2026-08-18",
        activityTypeId: 1,
        position: 0,
        markdown: "write READMEs",
        isGhost: false,
        source: null,
      },
    ]);
    const root = renderApp();
    await act(async () => {}); // flush initial load

    // The card must get the dark-derived fill, not the raw light pastel.
    const card = document.querySelector(".card") as HTMLElement;
    expect(card).not.toBeNull();
    // jsdom normalises the inline hsl() to rgb(); a dark fill has low channel
    // values (~48), a light pastel has high ones (~235).
    const bg = card.style.background;
    expect(bg).toMatch(/rgb\(\s*\d+,\s*\d+,\s*\d+/);
    const channels = bg.match(/\d+/g)!.slice(0, 3).map(Number);
    const mean = (channels[0] + channels[1] + channels[2]) / 3;
    expect(mean).toBeLessThan(100); // dark, not pastel
    act(() => root.unmount());
  });

  it("in system mode with a light OS, cards keep the light pastel fill", async () => {
    stubMatchMedia(false); // OS prefers light
    mocks.listCards.mockResolvedValue([
      {
        id: 6,
        date: "2026-08-18",
        activityTypeId: 1,
        position: 0,
        markdown: "do the car",
        isGhost: false,
        source: null,
      },
    ]);
    const root = renderApp();
    await act(async () => {}); // flush initial load

    const card = document.querySelector(".card") as HTMLElement;
    expect(card).not.toBeNull();
    // Light mode keeps the high-lightness pastel (high rgb channels ~235).
    const bg = card.style.background;
    const channels = bg.match(/\d+/g)!.slice(0, 3).map(Number);
    const mean = (channels[0] + channels[1] + channels[2]) / 3;
    expect(mean).toBeGreaterThan(200); // light pastel kept
    act(() => root.unmount());
  });
});

describe("idle day advance (Phase B.2)", () => {
  function todayISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  }
  function goToPreviousDay() {
    act(() => {
      document.querySelector('[aria-label="Previous day"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
  }

  it("advances to today after 15+ minutes idle on a different day", async () => {
    vi.useFakeTimers();
    const root = renderApp();
    await act(async () => {});

    goToPreviousDay();
    await act(async () => {});

    // No interaction since mount; after 16 minutes the board should move
    // back to the current day (the 30s poll alone would keep yesterday).
    await act(async () => {
      vi.advanceTimersByTime(16 * 60_000);
    });

    const dates = mocks.listCards.mock.calls.map((c) => c[0]);
    expect(dates).toContain(todayISO());
    act(() => root.unmount());
  });

  it("does not advance while the user is actively working", async () => {
    vi.useFakeTimers();
    const root = renderApp();
    await act(async () => {});

    goToPreviousDay();
    await act(async () => {});

    // A recent interaction resets the idle clock — 10 minutes later the
    // board must still be on yesterday (the last load is still yesterday).
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000);
    });

    const calls = mocks.listCards.mock.calls;
    const lastDate = calls[calls.length - 1]?.[0];
    expect(lastDate).not.toBe(todayISO());
    act(() => root.unmount());
  });
});
