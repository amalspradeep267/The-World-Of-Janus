// All tunable numbers live here so playtest changes are one-line edits.

export const RESOURCES = ['grain', 'timber', 'ore', 'wool', 'stone', 'coal', 'silk'] as const;
export type Resource = (typeof RESOURCES)[number];

export const RESOURCE_INFO: Record<Resource, { label: string; emoji: string; color: string }> = {
  grain: { label: 'Grain', emoji: '🌾', color: '#d9b84a' },
  timber: { label: 'Timber', emoji: '🪵', color: '#4f8a4a' },
  ore: { label: 'Ore', emoji: '⛏️', color: '#7d8796' },
  wool: { label: 'Wool', emoji: '🐑', color: '#9cc77a' },
  stone: { label: 'Stone', emoji: '🪨', color: '#a8826a' },
  coal: { label: 'Coal', emoji: '🔥', color: '#4a4a52' },
  silk: { label: 'Silk', emoji: '🧵', color: '#b46fb0' },
};

export const NATIONS = [
  { id: 'newyork', icon: '🗽', name: 'New York' },
  { id: 'london', icon: '💂', name: 'London' },
  { id: 'paris', icon: '🗼', name: 'Paris' },
  { id: 'rio', icon: '🏖️', name: 'Rio' },
  { id: 'tokyo', icon: '🏯', name: 'Tokyo' },
  { id: 'cairo', icon: '🐪', name: 'Cairo' },
  { id: 'rome', icon: '🏛️', name: 'Rome' },
  { id: 'sydney', icon: '🦘', name: 'Sydney' },
] as const;
export type NationId = (typeof NATIONS)[number]['id'];

export const PERSONAS = [
  'Napoleon',
  'Cleopatra',
  'Genghis Khan',
  'Elizabeth I',
  'Julius Caesar',
  'Joan of Arc',
  'Ashoka',
  'Catherine the Great',
  'Saladin',
  'Wu Zetian',
];

export type Faction = 'pact' | 'concord' | 'trader';

export const TRADER_GOAL = 4;
/** The Tribunal opens on this round. */
export const TRIBUNAL_FROM_ROUND = 3;
/** Exposing this many non-Pact players ends the game in a Pact win. */
export const WRONG_EXPOSURES_TO_LOSE = 1;

export const FACTION_INFO: Record<Faction, { label: string; goal: string }> = {
  pact: {
    label: 'Iron Pact',
    goal: 'Stay hidden. You win if any Pact player is still unexposed at the end, or if the Tribunal ever exposes an innocent.',
  },
  concord: {
    label: 'Concord',
    goal: 'Find the Iron Pact. Expose every Pact player at the Tribunal, without ever exposing an innocent.',
  },
  trader: {
    label: 'Free Trader',
    goal: `Win on your own by having at least ${TRADER_GOAL} goods flowing through your trade routes.`,
  },
};

/** Faction counts and map size per player count. Bot nations fill the rest of the map. */
export const SETUP_TABLE: Record<number, { pact: number; trader: number; nations: number; concordPairs: number }> = {
  3: { pact: 1, trader: 0, nations: 6, concordPairs: 0 },
  4: { pact: 1, trader: 1, nations: 6, concordPairs: 0 },
  5: { pact: 1, trader: 1, nations: 7, concordPairs: 1 },
  6: { pact: 2, trader: 1, nations: 7, concordPairs: 1 },
  7: { pact: 2, trader: 1, nations: 8, concordPairs: 1 },
  8: { pact: 2, trader: 1, nations: 8, concordPairs: 2 },
};
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

export const MAX_ROUNDS = 6;
export const MAP_RADIUS = 3;
export const TILES_PER_NATION = 3;

/** Dice rolls per harvest; each matching tile yields DICE_YIELD of its resource. */
export const HARVEST_ROLLS = 1;
export const DICE_YIELD = 2;
/** Every nation gets this much of each of its own resources every day, dice or not. */
export const BASE_INCOME = 1;

export const START_EACH = 2;
export const START_GOLD = 2;
export const START_PRICE = 3;

/** Night action costs. Envoys and routes are paid in resources of the player's choice. */
export const COST = { envoy: 2, route: 3, spyGold: 4 };

/** Bot behaviour per night. */
export const BOT = { envoyChance: 0.45, routeChance: 0.35, acceptChance: 0.6 };

/** Price change per unit of net demand (spent at night minus sold by day), in percent. */
export const PRICE_STEP_PCT = 8;
export const PRICE_CAP_PCT = 30;

