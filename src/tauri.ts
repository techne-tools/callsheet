// Typed Tauri bridge. Every command in CONTRACT.md is wrapped here with the
// exact camelCase shapes the backend (serde rename_all = "camelCase") expects.

import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Data shapes (mirror of CONTRACT.md / src-tauri/src/db.rs)
// ---------------------------------------------------------------------------

export interface Card {
  id: number;
  date: string;
  activityTypeId: number;
  position: number;
  markdown: string;
  isGhost: boolean;
  source: string | null;
}

export interface CardInput {
  id: number;
  date: string;
  activityTypeId: number;
  position: number;
  markdown: string;
  isGhost: boolean;
}

export interface ActivityType {
  id: number;
  name: string;
  colour: string;
  isSeed: boolean;
}

export interface Template {
  id: number;
  name: string;
  markdown: string;
  activityTypeId: number;
}

// ---------------------------------------------------------------------------
// Colour helpers (CONTRACT.md: border derived from fill hue at a lower
// lightness so the pastel reads as fill, not blur)
// ---------------------------------------------------------------------------

const HSL_RE = /hsl\(\s*(\d+)\s*,\s*([\d.]+)%\s*,\s*[\d.]+%\s*\)/;

/**
 * Derive the accent border from a fill HSL token (same hue, given lightness).
 * v0.4.0: default border lightness lowered 70 -> 62 so the border still frames
 * the strengthened (~88%) fills — a 70% border on an 88% fill would read as
 * blur, not frame.
 */
export function deriveBorder(fill: string, lightness = 62): string {
  const m = HSL_RE.exec(fill);
  if (!m) return fill;
  return `hsl(${m[1]}, ${m[2]}%, ${lightness}%)`;
}

/**
 * Derive a dark-theme fill from a light fill HSL token: same hue, saturation
 * held, lightness dropped to ~22% so the card reads as a quiet dark surface
 * with a coloured tint rather than a bright pastel on a dark background.
 * The border is derived from the same hue at a slightly lighter value so the
 * frame still reads against the dark fill.
 */
export function deriveDarkFill(fill: string, lightness = 22): string {
  const m = HSL_RE.exec(fill);
  if (!m) return fill;
  return `hsl(${m[1]}, ${m[2]}%, ${lightness}%)`;
}

export function deriveDarkBorder(fill: string, lightness = 34): string {
  const m = HSL_RE.exec(fill);
  if (!m) return fill;
  return `hsl(${m[1]}, ${m[2]}%, ${lightness}%)`;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export const listCards = (date: string): Promise<Card[]> =>
  invoke<Card[]>("list_cards", { date });

export const saveCard = (card: CardInput): Promise<Card> =>
  invoke<Card>("save_card", { card });

export const deleteCard = (id: number): Promise<void> =>
  invoke<void>("delete_card", { id });

export const reorderCards = (date: string, ids: number[]): Promise<Card[]> =>
  invoke<Card[]>("reorder_cards", { date, ids });

export const commitGhostCard = (id: number): Promise<Card> =>
  invoke<Card>("commit_ghost_card", { id });

export const proposeGhostCard = (
  date: string,
  activityTypeId: number,
  markdown: string,
  source: string,
): Promise<Card> =>
  invoke<Card>("propose_ghost_card", { date, activityTypeId, markdown, source });

// ---------------------------------------------------------------------------
// Activity types
// ---------------------------------------------------------------------------

export const listActivityTypes = (): Promise<ActivityType[]> =>
  invoke<ActivityType[]>("list_activity_types");

export const createActivityType = (name: string): Promise<ActivityType> =>
  invoke<ActivityType>("create_activity_type", { name });

export const deleteActivityType = (id: number): Promise<void> =>
  invoke<void>("delete_activity_type", { id });

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const listTemplates = (): Promise<Template[]> =>
  invoke<Template[]>("list_templates");

export const createTemplate = (
  name: string,
  markdown: string,
  activityTypeId: number,
): Promise<Template> =>
  invoke<Template>("create_template", { name, markdown, activityTypeId });

export const deleteTemplate = (id: number): Promise<void> =>
  invoke<void>("delete_template", { id });

export const updateTemplate = (
  id: number,
  name: string,
  markdown: string,
  activityTypeId: number,
): Promise<Template> =>
  invoke<Template>("update_template", { id, name, markdown, activityTypeId });

// ---------------------------------------------------------------------------
// Window presence
// ---------------------------------------------------------------------------

export const setWindowPresence = (mode: string): Promise<void> =>
  invoke<void>("set_window_presence", { mode });
