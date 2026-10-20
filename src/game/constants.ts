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

export type Faction = 'syndicate' | 'concord';

/**
 * 🟡 Free Trader is a title, not a faction: anyone whose city has this many trade
 * routes (goods opened on its connections) earns it. It's secret and grants the Tribunal veto.
 */
export const FREE_TRADER_ROUTES = 7;
/** The Tribunal opens on this round. */
export const TRIBUNAL_FROM_ROUND = 3;
/** Anyone the Tribunal exposes pays this on every trade, and earns less at the market. */
export const TARIFF = { tradeGold: 5, saleCut: 0.25 };

/**
 * The Tribunal: players pay to enter; it convenes with at least `minEntrants`.
 * Entrants vote for free, and a majority of entrants exposes the accused.
 * Voters who expose an innocent are fined. A Free Trader (title holder) may arm a secret veto.
 */
export const TRIBUNAL = { entryGold: 4, minEntrants: 3, innocentFine: 8, vetoGold: 10 };

export const FACTION_INFO: Record<Faction, { label: string; goal: string }> = {
  syndicate: {
    label: 'The Syndicate',
    goal: 'Stay hidden. You win if any Syndicate member is still unexposed at the end. Only you can use the black market and kidnap rulers for ransom.',
  },
  concord: {
    label: 'Concord',
    goal: 'Find the Syndicate. Expose every Syndicate member at the Tribunal before the game ends.',
  },
};

/** Faction counts and map size per player count. Bot nations fill the rest of the map. */
export const SETUP_TABLE: Record<number, { syndicate: number; nations: number; concordPairs: number }> = {
  3: { syndicate: 1, nations: 6, concordPairs: 0 },
  4: { syndicate: 1, nations: 6, concordPairs: 0 },
  5: { syndicate: 1, nations: 7, concordPairs: 1 },
  6: { syndicate: 2, nations: 7, concordPairs: 1 },
  7: { syndicate: 2, nations: 8, concordPairs: 2 },
  8: { syndicate: 2, nations: 8, concordPairs: 2 },
};
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

export const MAX_ROUNDS = 6;
export const MAP_RADIUS = 3;
export const TILES_PER_NATION = 3;

/**
 * Harvest dice: one 12-sided die per roll, so every number from 1 to 12 is equally likely
 * and no city is stuck with bad numbers. Each matching tile yields DICE_YIELD of its resource.
 */
export const DIE_SIDES = 12;
export const HARVEST_ROLLS = 1;
export const DICE_YIELD = 2;
/** Every nation gets this much of each of its own resources every day, dice or not. */
export const BASE_INCOME = 1;

export const START_EACH = 2;
// Prices and gold are whole numbers on a 10-per-card scale, so sales pay exactly the listed price.
export const START_GOLD = 15;
export const START_PRICE = 10;
export const MIN_PRICE = 2;

/**
 * Night action recipes. Each city produces only 3 of the 7 resources, so most
 * players must trade by day (publicly) or smuggle at night (expensively) to act.
 */
export const RECIPE: Record<'envoy' | 'route', Partial<Record<Resource, number>>> = {
  envoy: { grain: 1, wool: 1 },
  route: { timber: 1, stone: 1 },
};
/** Spies report one city's treasury for the round: gold earned from sales, and gold spent. */
export const COST = { spyGold: 12 };

/** Black market (night, Syndicate only): buy a card at the market price times this markup, rounded up. */
export const SMUGGLE_MARKUP = 1.5;
/** Black market (night, Syndicate only): pay this much gold to fake this many units of demand. */
export const PUMP = { gold: 6, units: 4 };

/**
 * 🗡️ Kidnapping (night, Syndicate only): name a city and the player you think rules it.
 * Right: that player pays you `ransom` gold every dawn, without learning who you are.
 * Wrong: you are exposed in the morning newspaper.
 */
export const KIDNAP = { gold: 15, ransom: 5 };

/** Trade route limits. */
export const MAX_GOODS_PER_ROUTE = 2;
export const MAX_ROUTES_PER_CITY = 4;

/** Envoys and trade routes to far-away cities cost extra gold: this much per hex beyond `freeHexes`. */
export const DISTANCE = { freeHexes: 2, goldPerHex: 2 };

/** Bot behaviour per night. */
export const BOT = { envoyChance: 0.45, routeChance: 0.35, acceptChance: 0.6 };

/**
 * Prices move on relative supply and demand. Each resource's imbalance
 * (demand minus SUPPLY_WEIGHT x supply) is compared with the average across all
 * resources, so only goods that are scarcer or more plentiful than the rest move.
 * Supply = units harvested + units sold. Demand = units spent on recipes, smuggled or pumped.
 */
export const SUPPLY_WEIGHT = 0.5;
export const PRICE_STEP_PCT = 6;
export const PRICE_CAP_PCT = 30;

