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
  | { kind: 'envoy'; to: NationId; paid: Partial<Hand>; gold: number }
  | { kind: 'route'; with: NationId; good: Resource; paid: Partial<Hand>; gold: number }
  | { kind: 'spy'; nation: NationId; gold: number }
  | { kind: 'smuggle'; good: Resource; gold: number }
  | { kind: 'pump'; good: Resource; gold: number }
  | { kind: 'kidnap'; nation: NationId; suspect: PlayerID; gold: number };

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
  /** Holds the secret 🟡 Free Trader title (earned with enough trade routes). */
  freeTrader: boolean;
  /** Free Traders only: gold set aside for a veto today (0 = not armed). Secret. */
  veto: number;
  /** One of this player's citizens is held for ransom by a (to them unknown) kidnapper. */
  captive: boolean;
  /** Syndicate: rulers paying this player ransom, and their cities. */
  hostages: { victim: PlayerID; nation: NationId }[];
  /** Syndicate: gold paid for security tonight (0 = none). Secret. */
  security: number;
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
}

/**
 * One player's gold movements this round. Secret; spies read the totals.
 * Illegal gold (ransoms, black market, kidnapping, security) is kept apart so hired security can hide it.
 */
export interface Ledger {
  received: number;
  spent: number;
  illegalIn: number;
  illegalOut: number;
}

/** Morning news is structured so the UI can draw it instead of printing sentences. */
export type NewsItem =
  | { t: 'prologue'; nations: number; players: number }
  | { t: 'envoy'; from: NationId; to: NationId }
  | { t: 'accepted' | 'declined' | 'expired'; from: NationId; to: NationId }
  | { t: 'route'; a: NationId; b: NationId; good: Resource }
  | { t: 'spy'; nation: NationId }
  | { t: 'kidnap'; nation: NationId }
  | { t: 'botched'; kidnapper: PlayerID; nation: NationId; target: NationId }
  | { t: 'quiet' }
  | { t: 'market'; changes: Partial<Record<Resource, number>> };

export interface Verdict {
  round: number;
  /** Fewer than the minimum entered: no session, fees refunded. */
  convened: boolean;
  /** The accused who reached a majority, or null when nobody did. */
  target: PlayerID | null;
  vetoed: boolean;
  /** Voters fined for exposing an innocent. */
  fined: PlayerID[];
}

export interface Settings {
  /** When false, the Tribunal reveals an exposed player's city but keeps their faction secret. */
  revealFaction: boolean;
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
  /** This morning's d12 rolls; tiles with a rolled number produce. */
  rolls: number[];
  prices: Record<Resource, number>;
  priceChange: Partial<Record<Resource, number>>;
  /** Units harvested or sold (supply) and spent, smuggled or pumped (demand) this round. */
  supply: Partial<Record<Resource, number>>;
  demand: Partial<Record<Resource, number>>;
  /** Morning news per round, newest last. Reports nations, never players. */
  news: { round: number; items: NewsItem[] }[];
  /** The public (surface-layer) log: trades, sales and the Tribunal, by player name. */
  publicLog: { round: number; text: string }[];
  trades: Trade[];
  /** Today's Tribunal: who paid to enter, and whom each entrant accuses. */
  entrants: Record<PlayerID, boolean>;
  votes: Record<PlayerID, PlayerID | null>;
  settings: Settings;
  ready: Record<PlayerID, boolean>;
  /** Public card count per player (not which cards), so hoarding can be spotted. */
  handSizes: Record<PlayerID, number>;
  /** faction is null when the host keeps exposed factions secret. */
  revealed: Record<PlayerID, { nation: NationId; faction: Faction | null }>;
  verdicts: Verdict[];
  /** Players exposed by the Tribunal pay a tariff on trades and sales. */
  tariffed: Record<PlayerID, boolean>;
  nextId: number;
  result: GameResult | null;

  // ---- secret: stripped by playerView ----
  owners: Partial<Record<NationId, Controller>>;
  players: Record<PlayerID, PlayerSecret>;
  ledgers: Record<PlayerID, Ledger>;
  /** Active kidnappings. Secret: victims know they're held, but not by whom. */
  kidnaps: { kidnapper: PlayerID; victim: PlayerID }[];
}
