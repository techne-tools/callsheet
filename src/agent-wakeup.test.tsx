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
});

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
});
