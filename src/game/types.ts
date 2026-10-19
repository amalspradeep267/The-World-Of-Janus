import type { Faction, NationId, Resource } from './constants';

export type Hand = Record<Resource, number>;
export type PlayerID = string;
/** Who controls a nation: a player's id, or 'bot'. */
export type Controller = PlayerID | 'bot';

export interface Tile {
  q: number;
  r: number;
  nation: NationId | null; // null = open sea / wilderness
  resource: Resource | null;
  number: number | null;
}

/** Public facts about a nation. Who controls it is never stored here. */
export interface Nation {
  id: NationId;
  icon: string;
  name: string;
  tiles: number[]; // indexes into G.tiles; first one is the capital
  resources: Resource[];
}

/** A connection between two nations, plus the goods they have opened trade in. */
export interface Route {
  a: NationId;
  b: NationId;
  goods: Resource[];
}

export interface Envoy {
  id: number;
  from: NationId;
  to: NationId;
  sentRound: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  /** Round in which the status changed; the following morning's news reports it. */
  resolvedRound?: number;
}

export type NightPlan =
  | { kind: 'envoy'; to: NationId; paid: Partial<Hand> }
  | { kind: 'route'; with: NationId; good: Resource; paid: Partial<Hand> }
  | { kind: 'spy'; nation: NationId; suspect: PlayerID; gold: number };

export interface PlayerSecret {
  nation: NationId;
  faction: Faction;
  hand: Hand;
  gold: number;
  /** Nations whose controller this player has learned (always includes their own). */
  known: Partial<Record<NationId, Controller>>;
  inbox: { round: number; text: string }[];
  plans: NightPlan[];
  /** What this morning's harvest brought: own land, and extra from trade routes. */
  harvest: { land: Hand; routes: Hand };
}

export interface Trade {
  id: number;
  from: PlayerID;
  to: PlayerID;
  give: Partial<Hand>;
  get: Partial<Hand>;
  status: 'open' | 'accepted' | 'declined' | 'cancelled' | 'expired';
}

export interface RosterEntry {
  id: PlayerID;
  name: string;
  persona: string;
}

/** Morning news is structured so the UI can draw it instead of printing sentences. */
export type NewsItem =
  | { t: 'prologue'; nations: number; players: number }
  | { t: 'envoy'; from: NationId; to: NationId }
  | { t: 'accepted' | 'declined' | 'expired'; from: NationId; to: NationId }
  | { t: 'route'; a: NationId; b: NationId; good: Resource }
  | { t: 'spy'; nation: NationId }
  | { t: 'quiet' }
  | { t: 'market'; changes: Partial<Record<Resource, number>> };

export interface Verdict {
  round: number;
  /** null when votes were cast but nobody reached a majority. */
  target: PlayerID | null;
}

export interface GameResult {
  winners: Faction[];
  reason: string;
}

export interface GState {
  roster: RosterEntry[];
  tiles: Tile[];
  nations: Partial<Record<NationId, Nation>>;
  nationOrder: NationId[];
  routes: Route[];
  envoys: Envoy[];
  round: number;
  /** This morning's dice, one pair per harvest roll, and their sums. */
  dice: [number, number][];
  rolls: number[];
  prices: Record<Resource, number>;
  priceChange: Partial<Record<Resource, number>>;
  /** Units spent at night / sold by day this round; drives the price moves. */
  demand: Partial<Record<Resource, number>>;
  /** Morning news per round, newest last. Reports nations, never players. */
  news: { round: number; items: NewsItem[] }[];
  /** The public (surface-layer) log: trades, sales and the Tribunal, by persona. */
  publicLog: { round: number; text: string }[];
  trades: Trade[];
  votes: Record<PlayerID, PlayerID | null>;
  ready: Record<PlayerID, boolean>;
  revealed: Record<PlayerID, { nation: NationId; faction: Faction }>;
  verdicts: Verdict[];
  wrongExposures: number;
  nextId: number;
  result: GameResult | null;

  // ---- secret: stripped by playerView ----
  owners: Partial<Record<NationId, Controller>>;
  players: Record<PlayerID, PlayerSecret>;
}
