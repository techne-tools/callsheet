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
// Colour helpers (CONTRACT.md: border derived from fill hue at 70% lightness)
// ---------------------------------------------------------------------------

const HSL_RE = /hsl\(\s*(\d+)\s*,\s*([\d.]+)%\s*,\s*[\d.]+%\s*\)/;

/** Derive the accent border from a fill HSL token (same hue, given lightness). */
export function deriveBorder(fill: string, lightness = 70): string {
  const m = HSL_RE.exec(fill);
  if (!m) return fill;
  return `hsl(${m[1]}, ${m[2]}%, ${lightness}%)`;
}

/** Secondary text tinted from the same hue (for quiet text on pastel fills). */
export function deriveTextSecondary(fill: string): string {
  const m = HSL_RE.exec(fill);
  if (!m) return "hsl(0, 0%, 40%)";
  return `hsl(${m[1]}, ${m[2]}%, 40%)`;
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

export const moveCard = (id: number, newPosition: number): Promise<void> =>
  invoke<void>("move_card", { id, newPosition });

export const commitGhostCard = (id: number): Promise<Card> =>
  invoke<Card>("commit_ghost_card", { id });

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
