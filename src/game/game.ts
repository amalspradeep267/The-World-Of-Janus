import type { FnContext, Game, PlayerID as BgioPlayerID } from 'boardgame.io';
import { ActivePlayers, INVALID_MOVE } from 'boardgame.io/core';
import {
  BASE_INCOME,
  BOT,
  COST,
  DISTANCE,
  FACTORY,
  DICE_YIELD,
  DIE_SIDES,
  FACTION_INFO,
  HARVEST_ROLLS,
  MAP_RADIUS,
  MAX_GOODS_PER_ROUTE,
  MAX_PLAYERS,
  MAX_ROUTES_PER_CITY,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MIN_PRICE,
  PRICE_CAP_PCT,
  PRICE_STEP_PCT,
  PUMP,
  RECIPE,
  SECURITY,
  RESOURCES,
  RESOURCE_INFO,
  SETUP_TABLE,
  SMUGGLE_MARKUP,
  SUPPLY_WEIGHT,
  TARIFF,
  START_EACH,
  START_GOLD,
  START_PRICE,
  FREE_TRADER_ROUTES,
  KIDNAP,
  TRIBUNAL,
  TRIBUNAL_FROM_ROUND,
  type Faction,
  type NationId,
  type Resource,
} from './constants';
import { generateMap, hexDistance, type Rng } from './map';
import type { GameResult, GState, Hand, NewsItem, PlayerID, PlayerSecret, Route, Settings } from './types';

export const GAME_NAME = 'the-world-of-janus';

// ---------- small helpers (exported for the UI and tests) ----------

export const emptyHand = (): Hand => Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Hand;

export const handTotal = (h: Partial<Hand>) => RESOURCES.reduce((sum, r) => sum + (h[r] ?? 0), 0);

export const formatGoods = (h: Partial<Hand>) =>
  RESOURCES.filter((r) => (h[r] ?? 0) > 0)
    .map((r) => `${h[r]} ${RESOURCE_INFO[r].emoji} ${RESOURCE_INFO[r].label}`)
    .join(', ');

export const findRoute = (G: GState, x: NationId, y: NationId): Route | undefined =>
  G.routes.find((rt) => (rt.a === x && rt.b === y) || (rt.a === y && rt.b === x));

export const icon = (G: GState, n: NationId) => `${G.nations[n]!.icon} ${G.nations[n]!.name}`;

const nameOf = (G: GState, pid: PlayerID) => G.roster.find((p) => p.id === pid)!.name;

export const routeCount = (G: GState, n: NationId) => G.routes.filter((rt) => rt.a === n || rt.b === n).length;

/** Hexes between two cities' capitals. */
export function cityDistance(G: GState, a: NationId, b: NationId) {
  const ta = G.tiles[G.nations[a]!.tiles[0]];
  const tb = G.tiles[G.nations[b]!.tiles[0]];
  return hexDistance(ta, tb);
}

/** Extra gold for an envoy or supply line between two cities, growing with distance. */
export const distanceGold = (G: GState, a: NationId, b: NationId) =>
  Math.max(0, cityDistance(G, a, b) - DISTANCE.freeHexes) * DISTANCE.goldPerHex;

/** Price of one card on the black market. */
export const smugglePrice = (G: GState, r: Resource) => Math.ceil(G.prices[r] * SMUGGLE_MARKUP);

function isValidGoods(paid: Partial<Hand>): boolean {
  if (!paid || typeof paid !== 'object') return false;
  for (const [k, v] of Object.entries(paid)) {
    if (!RESOURCES.includes(k as Resource) || !Number.isInteger(v) || (v as number) < 0) return false;
  }
  return handTotal(paid) > 0;
}

export const hasGoods = (hand: Hand, goods: Partial<Hand>) => RESOURCES.every((r) => hand[r] >= (goods[r] ?? 0));

/** Public card counts are refreshed at dawn and after public trades/sales, never mid-night. */
function snapshotHands(G: GState) {
  for (const pid of Object.keys(G.players)) G.handSizes[pid] = handTotal(G.players[pid].hand);
}

function moveGoods(from: Hand, to: Hand | null, goods: Partial<Hand>) {
  for (const r of RESOURCES) {
    from[r] -= goods[r] ?? 0;
    if (to) to[r] += goods[r] ?? 0;
  }
}

function refund(p: PlayerSecret, paid: Partial<Hand>) {
  for (const r of RESOURCES) p.hand[r] += paid[r] ?? 0;
}

function addDemand(G: GState, r: Resource, n: number) {
  G.demand[r] = (G.demand[r] ?? 0) + n;
}

function addSupply(G: GState, r: Resource, n: number) {
  G.supply[r] = (G.supply[r] ?? 0) + n;
}

const freshLedger = () => ({ received: 0, spent: 0, illegalIn: 0, illegalOut: 0 });

/** Night orders paid from the illegal side of the ledger. */
const ILLEGAL_KINDS = new Set(['smuggle', 'pump', 'kidnap']);

/** What a sale of `qty` pays this player, after any Tribunal tariff. */
export const saleValue = (G: GState, pid: PlayerID, r: Resource, qty: number) =>
  Math.round(G.prices[r] * qty * (G.tariffed[pid] ? 1 - TARIFF.saleCut : 1));

const pendingBetween = (G: GState, x: NationId, y: NationId) =>
  G.envoys.some((e) => e.status === 'pending' && ((e.from === x && e.to === y) || (e.from === y && e.to === x)));

const humans = (G: GState) => G.roster.map((p) => p.id);

/** Supply lines a city has: every good opened on any of its connections. */
export function tradeRouteCount(G: GState, n: NationId) {
  return G.routes.filter((rt) => rt.a === n || rt.b === n).reduce((s, rt) => s + rt.goods.length, 0);
}

const finalResult = (winners: Faction[], reason: string): GameResult => ({ winners, reason });

// ---------- phase hooks ----------

function startDay({ G, random }: { G: GState; random: Rng & { Die(sides: number): number } }) {
  if (G.result) return;
  G.round += 1;
  G.votes = {};
  G.entrants = {};
  G.ready = {};
  G.trades = [];
  for (const pid of humans(G)) G.ledgers[pid] = freshLedger();
  collectRansoms(G);

  G.rolls = Array.from({ length: HARVEST_ROLLS }, () => random.Die(DIE_SIDES));

  const gains: Partial<Record<NationId, Hand>> = {};
  for (const n of G.nationOrder) {
    const g = emptyHand();
    for (const r of G.nations[n]!.resources) g[r] += BASE_INCOME;
    for (const ti of G.nations[n]!.tiles) {
      const tile = G.tiles[ti];
      const hits = G.rolls.filter((roll) => roll === tile.number).length;
      g[tile.resource!] += hits * DICE_YIELD;
    }
    for (const f of G.nations[n]!.factories) g[f.good] += FACTORY.yield;
    gains[n] = g;
    for (const r of RESOURCES) if (g[r]) addSupply(G, r, g[r]);
  }
  // Supply lines: whenever your partner harvests (or manufactures) a shared good, you receive one too.
  const bonus: Partial<Record<NationId, Hand>> = Object.fromEntries(G.nationOrder.map((n) => [n, emptyHand()]));
  for (const rt of G.routes) {
    for (const good of rt.goods) {
      if (gains[rt.a]![good] > 0) bonus[rt.b]![good] += 1;
      if (gains[rt.b]![good] > 0) bonus[rt.a]![good] += 1;
    }
  }

  for (const pid of humans(G)) {
    const p = G.players[pid];
    const g = gains[p.nation]!;
    const b = bonus[p.nation]!;
    for (const r of RESOURCES) p.hand[r] += g[r] + b[r];
    p.harvest = { land: g, routes: b };
    const routePart = handTotal(b) > 0 ? ` Supply lines brought in ${formatGoods(b)}.` : '';
    p.inbox.push({ round: G.round, text: `Harvest: ${formatGoods(g)}.${routePart}` });
  }
  snapshotHands(G);
}

/** Each dawn, every captive pays their kidnapper; exposed kidnappers lose their hostages. */
function collectRansoms(G: GState) {
  for (const k of [...G.kidnaps]) {
    const victim = G.players[k.victim];
    const kidnapper = G.players[k.kidnapper];
    if (G.revealed[k.kidnapper]) {
      release(G, k.kidnapper);
      continue;
    }
    const pay = Math.min(KIDNAP.ransom, victim.gold);
    victim.gold -= pay;
    G.ledgers[k.victim].spent += pay;
    kidnapper.gold += pay;
    G.ledgers[k.kidnapper].illegalIn += pay;
    victim.inbox.push({ round: G.round, text: `⛓️ You paid ${pay} gold in ransom to keep your kidnapped citizen safe.` });
    kidnapper.inbox.push({ round: G.round, text: `🗡️ ${nameOf(G, k.victim)} paid you ${pay} gold in ransom.` });
  }
}

/** Free everyone a kidnapper holds (when the kidnapper has been exposed). */
function release(G: GState, kidnapper: PlayerID) {
  for (const k of G.kidnaps.filter((x) => x.kidnapper === kidnapper)) {
    G.players[k.victim].captive = false;
    G.players[k.victim].inbox.push({ round: G.round, text: '🕊️ The kidnapper was exposed and your citizen is free. No more ransom.' });
  }
  G.kidnaps = G.kidnaps.filter((x) => x.kidnapper !== kidnapper);
  G.players[kidnapper].hostages = [];
}

function endDay({ G }: { G: GState }) {
  for (const t of G.trades) if (t.status === 'open') t.status = 'expired';
  G.trades = [];

  if (G.round >= TRIBUNAL_FROM_ROUND) resolveTribunal(G);
  for (const pid of humans(G)) G.players[pid].veto = 0;
  G.votes = {};
  G.entrants = {};
  G.ready = {};
}

function spend(G: GState, pid: PlayerID, gold: number) {
  G.players[pid].gold -= gold;
  G.ledgers[pid].spent += gold;
}
function unspend(G: GState, pid: PlayerID, gold: number) {
  G.players[pid].gold += gold;
  G.ledgers[pid].spent -= gold;
}

function resolveTribunal(G: GState) {
  const entrants = humans(G).filter((pid) => G.entrants[pid]);
  if (entrants.length === 0) return;
  if (entrants.length < TRIBUNAL.minEntrants) {
    for (const pid of entrants) unspend(G, pid, TRIBUNAL.entryGold);
    for (const pid of entrants) if (G.players[pid].veto) unspend(G, pid, G.players[pid].veto);
    G.verdicts.push({ round: G.round, convened: false, target: null, vetoed: false, fined: [] });
    G.publicLog.push({
      round: G.round,
      text: `⚖️ Only ${entrants.length} entered the Tribunal (${TRIBUNAL.minEntrants} needed). It did not sit; fees were refunded.`,
    });
    return;
  }

  const tally: Record<PlayerID, number> = {};
  for (const pid of entrants) {
    const target = G.votes[pid];
    if (target != null) tally[target] = (tally[target] ?? 0) + 1;
  }
  const majority = Math.floor(entrants.length / 2) + 1;
  const accused = Object.keys(tally).find((pid) => tally[pid] >= majority && !G.revealed[pid]) ?? null;
  const vetoer = entrants.find((pid) => G.players[pid].veto > 0);

  // An unused veto is refunded.
  if (vetoer && !accused) unspend(G, vetoer, G.players[vetoer].veto);

  if (!accused) {
    G.verdicts.push({ round: G.round, convened: true, target: null, vetoed: false, fined: [] });
    G.publicLog.push({ round: G.round, text: `⚖️ The Tribunal (${entrants.length} entrants) could not reach a majority.` });
    return;
  }
  if (vetoer) {
    G.verdicts.push({ round: G.round, convened: true, target: accused, vetoed: true, fined: [] });
    G.publicLog.push({ round: G.round, text: `⚖️ The Tribunal moved to expose ${nameOf(G, accused)}, but a secret veto struck the verdict down.` });
    return;
  }

  const p = G.players[accused];
  G.revealed[accused] = { nation: p.nation, faction: G.settings.revealFaction ? p.faction : null };
  G.tariffed[accused] = true;
  const innocent = p.faction !== 'syndicate';
  const fined = innocent ? entrants.filter((pid) => G.votes[pid] === accused) : [];
  for (const pid of fined) spend(G, pid, Math.min(TRIBUNAL.innocentFine, G.players[pid].gold));
  G.verdicts.push({ round: G.round, convened: true, target: accused, vetoed: false, fined });
  const factionText = G.settings.revealFaction ? ` Faction: ${FACTION_INFO[p.faction].label}.` : ' Their faction stays secret.';
  const fineText = fined.length ? ` They were innocent: ${fined.map((pid) => nameOf(G, pid)).join(', ')} paid a ${TRIBUNAL.innocentFine}-gold fine.` : '';
  G.publicLog.push({
    round: G.round,
    text: `⚖️ The Tribunal exposed ${nameOf(G, accused)}: they rule ${icon(G, p.nation)}.${factionText} A tariff now applies to all their trades.${G.settings.revealFaction ? fineText : ''}`,
  });
  // Fines happen either way; with factions secret, they are reported without saying why.
  if (!G.settings.revealFaction && fined.length) {
    G.publicLog.push({ round: G.round, text: `⚖️ ${fined.map((pid) => nameOf(G, pid)).join(', ')} paid a fine of ${TRIBUNAL.innocentFine} gold.` });
  }
  const left = humans(G).filter((pid) => G.players[pid].faction === 'syndicate' && !G.revealed[pid]);
  if (left.length === 0) G.result = finalResult(['concord'], 'Every Syndicate member was exposed. The Concord wins.');
}

function startNight({ G }: { G: GState }) {
  G.ready = {};
}

function resolveNight({ G, random }: { G: GState; random: Rng }) {
  const items: NewsItem[] = [];

  // Gold spent tonight goes on each player's ledger (spies read it below).
  for (const pid of humans(G)) {
    for (const plan of G.players[pid].plans) {
      if (ILLEGAL_KINDS.has(plan.kind)) G.ledgers[pid].illegalOut += plan.gold;
      else G.ledgers[pid].spent += plan.gold;
    }
  }
  const spyOrders: { pid: PlayerID; nation: NationId }[] = [];
  const kidnapOrders: { pid: PlayerID; nation: NationId; suspect: PlayerID; gold: number }[] = [];

  // Player actions, in shuffled order so the news order leaks nothing.
  for (const pid of random.Shuffle(humans(G))) {
    const p = G.players[pid];
    for (const plan of p.plans) {
      if (plan.kind === 'envoy') {
        if (findRoute(G, p.nation, plan.to) || pendingBetween(G, p.nation, plan.to) || routeCount(G, p.nation) >= MAX_ROUTES_PER_CITY) {
          refund(p, plan.paid);
          unspend(G, pid, plan.gold);
          p.inbox.push({ round: G.round, text: `Your envoy to ${icon(G, plan.to)} was recalled (already in contact). Refunded.` });
          continue;
        }
        G.envoys.push({ id: G.nextId++, from: p.nation, to: plan.to, sentRound: G.round, status: 'pending' });
        items.push({ t: 'envoy', from: p.nation, to: plan.to });
      } else if (plan.kind === 'route') {
        const rt = findRoute(G, p.nation, plan.with);
        if (!rt || rt.goods.includes(plan.good) || rt.goods.length >= MAX_GOODS_PER_ROUTE) {
          refund(p, plan.paid);
          unspend(G, pid, plan.gold);
          p.inbox.push({ round: G.round, text: `Trade with ${icon(G, plan.with)} could not open. Refunded.` });
          continue;
        }
        rt.goods.push(plan.good);
        items.push({ t: 'route', a: rt.a, b: rt.b, good: plan.good });
      } else if (plan.kind === 'smuggle') {
        p.hand[plan.good] += 1;
        addDemand(G, plan.good, 1);
        p.inbox.push({ round: G.round, text: `🕶️ Smugglers delivered 1 ${RESOURCE_INFO[plan.good].emoji} ${RESOURCE_INFO[plan.good].label}.` });
      } else if (plan.kind === 'pump') {
        addDemand(G, plan.good, PUMP.units);
        p.inbox.push({ round: G.round, text: `🕶️ Your agents bid up ${RESOURCE_INFO[plan.good].emoji} ${RESOURCE_INFO[plan.good].label}.` });
      } else if (plan.kind === 'factory') {
        const n = G.nations[p.nation]!;
        if (n.factories.some((f) => f.tile === plan.tile)) {
          refund(p, plan.paid);
          p.inbox.push({ round: G.round, text: 'That tile already has a factory. Refunded.' });
          continue;
        }
        n.factories.push({ tile: plan.tile, good: plan.good });
        items.push({ t: 'factory', nation: p.nation, good: plan.good });
        p.inbox.push({
          round: G.round,
          text: `🏭 Your factory is built on your ${RESOURCE_INFO[plan.good].label} tile. It adds ${FACTORY.yield} ${RESOURCE_INFO[plan.good].emoji} every dawn.`,
        });
      } else if (plan.kind === 'kidnap') {
        kidnapOrders.push({ pid, nation: plan.nation, suspect: plan.suspect, gold: plan.gold });
      } else {
        spyOrders.push({ pid, nation: plan.nation });
        items.push({ t: 'spy', nation: plan.nation });
      }
      if ('paid' in plan) for (const r of RESOURCES) if (plan.paid[r]) addDemand(G, r, plan.paid[r]!);
    }
    p.plans = [];
  }

  for (const order of kidnapOrders) {
    const k = G.players[order.pid];
    const right = G.owners[order.nation] === order.suspect;
    if (right) {
      const victim = G.players[order.suspect];
      if (victim.captive) {
        k.gold += order.gold;
        G.ledgers[order.pid].illegalOut -= order.gold;
        k.inbox.push({ round: G.round, text: `🗡️ ${nameOf(G, order.suspect)} is already being held. Your gold was returned.` });
        continue;
      }
      victim.captive = true;
      G.kidnaps.push({ kidnapper: order.pid, victim: order.suspect });
      k.hostages.push({ victim: order.suspect, nation: order.nation });
      k.known[order.nation] = order.suspect;
      victim.inbox.push({
        round: G.round,
        text: `⛓️ Kidnappers seized one of your citizens in ${icon(G, order.nation)}. You'll pay ${KIDNAP.ransom} gold every dawn to keep them safe, to a Syndicate member you can't name, until they're exposed.`,
      });
      k.inbox.push({ round: G.round, text: `🗡️ Success: you hold a citizen of ${icon(G, order.nation)}. Its ruler, ${nameOf(G, order.suspect)}, pays you ransom every dawn.` });
      items.push({ t: 'kidnap', nation: order.nation });
    } else {
      // A botched kidnapping exposes the kidnapper to everyone.
      G.revealed[order.pid] = { nation: k.nation, faction: 'syndicate' };
      G.tariffed[order.pid] = true;
      release(G, order.pid);
      items.push({ t: 'botched', kidnapper: order.pid, nation: k.nation, target: order.nation });
      G.publicLog.push({
        round: G.round,
        text: `🗡️ A botched kidnapping in ${icon(G, order.nation)} exposed ${nameOf(G, order.pid)}: they rule ${icon(G, k.nation)} and belong to the Syndicate.`,
      });
      const left = humans(G).filter((pid) => G.players[pid].faction === 'syndicate' && !G.revealed[pid]);
      if (left.length === 0 && !G.result) G.result = finalResult(['concord'], 'Every Syndicate member was exposed. The Concord wins.');
    }
  }

  for (const { pid, nation } of spyOrders) {
    const owner = G.owners[nation]!;
    const l = owner === 'bot' ? freshLedger() : G.ledgers[owner];
    // Bribed spies (the target hired security) leave the illegal gold out of their report.
    const bribed = owner !== 'bot' && G.players[owner].security > 0;
    const received = l.received + (bribed ? 0 : l.illegalIn);
    const spent = l.spent + (bribed ? 0 : l.illegalOut);
    G.players[pid].inbox.push({
      round: G.round,
      text:
        received === 0 && spent === 0
          ? `🕵️ Spies in ${icon(G, nation)}: its treasury didn't move this round.`
          : `🕵️ Spies in ${icon(G, nation)}: this round it received ${received} gold and spent ${spent} gold.`,
    });
  }
  for (const pid of humans(G)) G.players[pid].security = 0;

  // Bot nations.
  const bots = G.nationOrder.filter((n) => G.owners[n] === 'bot');
  for (const n of random.Shuffle(bots)) {
    for (const e of G.envoys) {
      if (e.to === n && e.status === 'pending' && e.sentRound < G.round) {
        const room = routeCount(G, e.from) < MAX_ROUTES_PER_CITY && routeCount(G, n) < MAX_ROUTES_PER_CITY;
        e.status = room && random.Number() < BOT.acceptChance ? 'accepted' : 'declined';
        e.resolvedRound = G.round;
        if (e.status === 'accepted') G.routes.push({ a: e.from, b: e.to, goods: [] });
      }
    }
    if (routeCount(G, n) < MAX_ROUTES_PER_CITY && random.Number() < BOT.envoyChance) {
      const targets = G.nationOrder.filter((m) => m !== n && !findRoute(G, n, m) && !pendingBetween(G, n, m));
      if (targets.length) {
        const to = random.Shuffle(targets)[0];
        G.envoys.push({ id: G.nextId++, from: n, to, sentRound: G.round, status: 'pending' });
        items.push({ t: 'envoy', from: n, to });
        for (const [r, q] of Object.entries(RECIPE.envoy)) addDemand(G, r as Resource, q!);
      }
    }
    if (random.Number() < BOT.routeChance) {
      const options = G.routes
        .filter((rt) => (rt.a === n || rt.b === n) && rt.goods.length < MAX_GOODS_PER_ROUTE)
        .flatMap((rt) => {
          const all = new Set([...G.nations[rt.a]!.resources, ...G.nations[rt.b]!.resources]);
          return [...all].filter((good) => !rt.goods.includes(good)).map((good) => ({ rt, good }));
        });
      if (options.length) {
        const { rt, good } = random.Shuffle(options)[0];
        rt.goods.push(good);
        items.push({ t: 'route', a: rt.a, b: rt.b, good });
        for (const [r, q] of Object.entries(RECIPE.route)) addDemand(G, r as Resource, q!);
      }
    }
  }

  // Envoys left unanswered for a full day and night expire.
  for (const e of G.envoys) {
    if (e.status === 'pending' && e.sentRound < G.round) {
      e.status = 'expired';
      e.resolvedRound = G.round;
    }
  }
  for (const e of G.envoys) {
    if (e.resolvedRound !== G.round || e.status === 'pending') continue;
    items.push({ t: e.status, from: e.from, to: e.to });
  }

  // Markets: a price moves when its good is scarcer or more plentiful than the average good.
  G.priceChange = {};
  const imbalance = Object.fromEntries(
    RESOURCES.map((r) => [r, (G.demand[r] ?? 0) - SUPPLY_WEIGHT * (G.supply[r] ?? 0)]),
  ) as Record<Resource, number>;
  const mean = RESOURCES.reduce((sum, r) => sum + imbalance[r], 0) / RESOURCES.length;
  for (const r of RESOURCES) {
    const pct = Math.max(-PRICE_CAP_PCT, Math.min(PRICE_CAP_PCT, Math.round((imbalance[r] - mean) * PRICE_STEP_PCT)));
    const next = Math.max(MIN_PRICE, Math.round(G.prices[r] * (1 + pct / 100)));
    if (next === G.prices[r]) continue;
    G.priceChange[r] = Math.round(((next - G.prices[r]) / G.prices[r]) * 100);
    G.prices[r] = next;
  }
  G.demand = {};
  G.supply = {};

  const news = random.Shuffle(items);
  if (news.length === 0) news.push({ t: 'quiet' });
  if (Object.keys(G.priceChange).length) news.push({ t: 'market', changes: { ...G.priceChange } });
  G.news.push({ round: G.round, items: news });

  // Award the secret Free Trader title to anyone who now has enough supply lines.
  for (const pid of humans(G)) {
    const p = G.players[pid];
    if (!p.freeTrader && tradeRouteCount(G, p.nation) >= FREE_TRADER_ROUTES) {
      p.freeTrader = true;
      p.inbox.push({
        round: G.round,
        text: `🟡 With ${FREE_TRADER_ROUTES} supply lines you've earned the secret title of Free Trader. You can now veto the Tribunal.`,
      });
    }
  }
  G.ready = {};

  if (!G.result && G.round >= MAX_ROUNDS) {
    const hidden = humans(G).filter((pid) => G.players[pid].faction === 'syndicate' && !G.revealed[pid]);
    G.result = finalResult(
      hidden.length ? ['syndicate'] : ['concord'],
      hidden.length
        ? 'Time ran out with Syndicate members still hidden. The Syndicate wins.'
        : 'The Syndicate was fully exposed. The Concord wins.',
    );
  }
}

// ---------- moves ----------

type Ctx = FnContext<GState> & { playerID: BgioPlayerID };

/** Moves run only on the host: clients hold a filtered state and can't validate everything. */
const hostOnly = (fn: (c: Ctx, ...args: any[]) => any) => ({ move: fn, client: false });

const me = (G: GState, playerID: PlayerID | undefined) => (playerID != null ? G.players[playerID] : undefined);

const setReady = hostOnly(({ G, playerID }, value: boolean) => {
  if (playerID == null || !G.players[playerID]) return INVALID_MOVE;
  G.ready[playerID] = !!value;
});

const respondEnvoy = hostOnly(({ G, playerID }, id: number, accept: boolean) => {
  const p = me(G, playerID);
  const e = G.envoys.find((x) => x.id === id);
  if (!p || !e || e.to !== p.nation || e.status !== 'pending') return INVALID_MOVE;
  if (accept && (routeCount(G, e.from) >= MAX_ROUTES_PER_CITY || routeCount(G, e.to) >= MAX_ROUTES_PER_CITY)) return INVALID_MOVE;
  e.status = accept ? 'accepted' : 'declined';
  e.resolvedRound = G.round;
  if (!accept) return;
  G.routes.push({ a: e.from, b: e.to, goods: [] });
  const sender = G.owners[e.from]!;
  p.known[e.from] = sender;
  p.inbox.push({
    round: G.round,
    text:
      sender === 'bot'
        ? `You accepted the envoy from ${icon(G, e.from)}. It bears no seal: no player rules it.`
        : `You accepted the envoy from ${icon(G, e.from)}. It was sent by ${nameOf(G, sender)}.`,
  });
});

const proposeTrade = hostOnly(({ G, playerID }, to: PlayerID, give: Partial<Hand>, get: Partial<Hand>) => {
  const p = me(G, playerID);
  if (!p || to === playerID || !G.players[to]) return INVALID_MOVE;
  if (!isValidGoods(give) || !isValidGoods(get) || !hasGoods(p.hand, give)) return INVALID_MOVE;
  if (G.trades.filter((t) => t.from === playerID && t.status === 'open').length >= 3) return INVALID_MOVE;
  G.trades.push({ id: G.nextId++, from: playerID!, to, give, get, status: 'open' });
});

const respondTrade = hostOnly(({ G, playerID }, id: number, accept: boolean) => {
  const t = G.trades.find((x) => x.id === id);
  if (!t || t.status !== 'open' || t.to !== playerID) return INVALID_MOVE;
  if (!accept) {
    t.status = 'declined';
    return;
  }
  const from = G.players[t.from];
  const to = G.players[t.to];
  if (!hasGoods(from.hand, t.give) || !hasGoods(to.hand, t.get)) return INVALID_MOVE;
  const fee = (pid: PlayerID) => (G.tariffed[pid] ? TARIFF.tradeGold : 0);
  if (from.gold < fee(t.from) || to.gold < fee(t.to)) return INVALID_MOVE;
  for (const pid of [t.from, t.to]) {
    G.players[pid].gold -= fee(pid);
    G.ledgers[pid].spent += fee(pid);
  }
  moveGoods(from.hand, to.hand, t.give);
  moveGoods(to.hand, from.hand, t.get);
  t.status = 'accepted';
  snapshotHands(G);
  const tariffNote = fee(t.from) + fee(t.to) > 0 ? ' (tariff paid)' : '';
  G.publicLog.push({
    round: G.round,
    text: `🔁 ${nameOf(G, t.from)} traded ${formatGoods(t.give)} to ${nameOf(G, t.to)} for ${formatGoods(t.get)}${tariffNote}.`,
  });
});

const cancelTrade = hostOnly(({ G, playerID }, id: number) => {
  const t = G.trades.find((x) => x.id === id);
  if (!t || t.status !== 'open' || t.from !== playerID) return INVALID_MOVE;
  t.status = 'cancelled';
});

const sell = hostOnly(({ G, playerID }, resource: Resource, qty: number) => {
  const p = me(G, playerID);
  if (!p || !RESOURCES.includes(resource) || !Number.isInteger(qty) || qty < 1 || p.hand[resource] < qty) {
    return INVALID_MOVE;
  }
  p.hand[resource] -= qty;
  const earned = saleValue(G, playerID!, resource, qty);
  p.gold += earned;
  G.ledgers[playerID!].received += earned;
  addSupply(G, resource, qty);
  snapshotHands(G);
  G.publicLog.push({
    round: G.round,
    text: `💰 ${nameOf(G, playerID!)} sold ${qty} ${RESOURCE_INFO[resource].emoji} ${RESOURCE_INFO[resource].label} for ${earned} gold${G.tariffed[playerID!] ? ' (after tariff)' : ''}.`,
  });
});

const enterTribunal = hostOnly(({ G, playerID }) => {
  const p = me(G, playerID);
  if (!p || G.round < TRIBUNAL_FROM_ROUND || G.entrants[playerID!] || p.gold < TRIBUNAL.entryGold) return INVALID_MOVE;
  spend(G, playerID!, TRIBUNAL.entryGold);
  G.entrants[playerID!] = true;
});

/** Entrants vote for free (entry is the only fee); they can switch or withdraw until dusk. */
const vote = hostOnly(({ G, playerID }, target: PlayerID | null) => {
  if (!me(G, playerID) || G.round < TRIBUNAL_FROM_ROUND || !G.entrants[playerID!]) return INVALID_MOVE;
  if (target != null && (target === playerID || !G.players[target] || G.revealed[target])) return INVALID_MOVE;
  G.votes[playerID!] = target;
});

/** Free Trader only, inside the Tribunal: arm (or disarm) a secret veto for today. */
const armVeto = hostOnly(({ G, playerID }, on: boolean) => {
  const p = me(G, playerID);
  if (!p || !p.freeTrader || !G.entrants[playerID!]) return INVALID_MOVE;
  if (on && !p.veto) {
    if (p.gold < TRIBUNAL.vetoGold) return INVALID_MOVE;
    spend(G, playerID!, TRIBUNAL.vetoGold);
    p.veto = TRIBUNAL.vetoGold;
  } else if (!on && p.veto) {
    unspend(G, playerID!, p.veto);
    p.veto = 0;
  }
});

const planEnvoy = hostOnly(({ G, playerID }, to: NationId) => {
  const p = me(G, playerID);
  if (!p || !G.nations[to] || to === p.nation) return INVALID_MOVE;
  if (findRoute(G, p.nation, to) || pendingBetween(G, p.nation, to)) return INVALID_MOVE;
  if (p.plans.some((x) => x.kind === 'envoy' && x.to === to)) return INVALID_MOVE;
  const planned = p.plans.filter((x) => x.kind === 'envoy').length;
  if (routeCount(G, p.nation) + planned >= MAX_ROUTES_PER_CITY) return INVALID_MOVE;
  const paid = { ...RECIPE.envoy };
  const gold = distanceGold(G, p.nation, to);
  if (!hasGoods(p.hand, paid) || p.gold < gold) return INVALID_MOVE;
  moveGoods(p.hand, null, paid);
  p.gold -= gold;
  p.plans.push({ kind: 'envoy', to, paid, gold });
});

const planRoute = hostOnly(({ G, playerID }, partner: NationId, good: Resource) => {
  const p = me(G, playerID);
  if (!p || !G.nations[partner]) return INVALID_MOVE;
  const rt = findRoute(G, p.nation, partner);
  if (!rt || rt.goods.includes(good)) return INVALID_MOVE;
  if (![...G.nations[p.nation]!.resources, ...G.nations[partner]!.resources].includes(good)) return INVALID_MOVE;
  if (p.plans.some((x) => x.kind === 'route' && x.with === partner && x.good === good)) return INVALID_MOVE;
  const planned = p.plans.filter((x) => x.kind === 'route' && x.with === partner).length;
  if (rt.goods.length + planned >= MAX_GOODS_PER_ROUTE) return INVALID_MOVE;
  const paid = { ...RECIPE.route };
  const gold = distanceGold(G, p.nation, partner);
  if (!hasGoods(p.hand, paid) || p.gold < gold) return INVALID_MOVE;
  moveGoods(p.hand, null, paid);
  p.gold -= gold;
  p.plans.push({ kind: 'route', with: partner, good, paid, gold });
});

const planSpy = hostOnly(({ G, playerID }, nation: NationId) => {
  const p = me(G, playerID);
  if (!p || !G.nations[nation] || nation === p.nation) return INVALID_MOVE;
  if (p.plans.some((x) => x.kind === 'spy' && x.nation === nation)) return INVALID_MOVE;
  if (p.gold < COST.spyGold) return INVALID_MOVE;
  p.gold -= COST.spyGold;
  p.plans.push({ kind: 'spy', nation, gold: COST.spyGold });
});

const isSyndicate = (p: PlayerSecret | undefined) => p?.faction === 'syndicate';

/** Can a factory go on this tile of your city? (One per tile; optionally only some tile types.) */
export function canBuildFactory(G: GState, p: PlayerSecret, tile: number) {
  const n = G.nations[p.nation]!;
  const t = G.tiles[tile];
  if (!n.tiles.includes(tile) || !t?.resource) return false;
  if (FACTORY.tiles && !FACTORY.tiles.includes(t.resource)) return false;
  if (n.factories.some((f) => f.tile === tile)) return false;
  return !p.plans.some((x) => x.kind === 'factory' && x.tile === tile);
}

/** Build a factory on one of your own tiles: it adds more of that tile's resource every dawn. */
const planFactory = hostOnly(({ G, playerID }, tile: number) => {
  const p = me(G, playerID);
  if (!p || !Number.isInteger(tile) || !canBuildFactory(G, p, tile)) return INVALID_MOVE;
  const paid = { ...RECIPE.factory };
  if (!hasGoods(p.hand, paid)) return INVALID_MOVE;
  moveGoods(p.hand, null, paid);
  p.plans.push({ kind: 'factory', tile, good: G.tiles[tile].resource!, paid, gold: 0 });
});

/** Syndicate only, day or night: hire (or dismiss) security that bribes tonight's spies. */
const hireSecurity = hostOnly(({ G, playerID }, on: boolean) => {
  const p = me(G, playerID);
  if (!p || !isSyndicate(p)) return INVALID_MOVE;
  if (on && !p.security) {
    if (p.gold < SECURITY.gold) return INVALID_MOVE;
    p.gold -= SECURITY.gold;
    G.ledgers[playerID!].illegalOut += SECURITY.gold;
    p.security = SECURITY.gold;
  } else if (!on && p.security) {
    p.gold += p.security;
    G.ledgers[playerID!].illegalOut -= p.security;
    p.security = 0;
  }
});

/** Syndicate only: seize a citizen of a city, naming the player you think rules it. */
const planKidnap = hostOnly(({ G, playerID }, nation: NationId, suspect: PlayerID) => {
  const p = me(G, playerID);
  if (!p || !isSyndicate(p) || !G.nations[nation] || nation === p.nation) return INVALID_MOVE;
  if (!G.players[suspect] || suspect === playerID || G.players[suspect].faction === 'syndicate') return INVALID_MOVE;
  if (p.plans.some((x) => x.kind === 'kidnap') || p.gold < KIDNAP.gold) return INVALID_MOVE;
  p.gold -= KIDNAP.gold;
  p.plans.push({ kind: 'kidnap', nation, suspect, gold: KIDNAP.gold });
});

const planSmuggle = hostOnly(({ G, playerID }, good: Resource) => {
  const p = me(G, playerID);
  if (!p || !isSyndicate(p) || !RESOURCES.includes(good)) return INVALID_MOVE;
  const gold = smugglePrice(G, good);
  if (p.gold < gold) return INVALID_MOVE;
  p.gold -= gold;
  p.plans.push({ kind: 'smuggle', good, gold });
});

const planPump = hostOnly(({ G, playerID }, good: Resource) => {
  const p = me(G, playerID);
  if (!p || !isSyndicate(p) || !RESOURCES.includes(good) || p.gold < PUMP.gold) return INVALID_MOVE;
  p.gold -= PUMP.gold;
  p.plans.push({ kind: 'pump', good, gold: PUMP.gold });
});

const cancelPlan = hostOnly(({ G, playerID }, index: number) => {
  const p = me(G, playerID);
  const plan = p?.plans[index];
  if (!p || !plan) return INVALID_MOVE;
  p.gold += plan.gold;
  if ('paid' in plan) refund(p, plan.paid);
  p.plans.splice(index, 1);
});

// ---------- the game ----------

const allReady = ({ G }: { G: GState }) => G.roster.every((p) => G.ready[p.id]);

/**
 * Builds the game for a given roster. The P2P transport can't pass setup data,
 * so the friend names (shared through the room link) are baked in here.
 */
export function makeGame(names: string[], settings: Settings = { revealFaction: true }): Game<GState> {
  return {
    name: GAME_NAME,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,

    setup: ({ ctx, random }) => {
      const count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, ctx.numPlayers));
      const table = SETUP_TABLE[count];
      const { tiles, nations, nationOrder } = generateMap(random, table.nations, MAP_RADIUS);

      const ids = Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
      const roster = ids.map((id, i) => ({ id, name: names[i] ?? `Player ${i + 1}` }));

      const factions: Faction[] = [
        ...Array(table.syndicate).fill('syndicate'),
        ...Array(count - table.syndicate).fill('concord'),
      ];
      const dealt = random.Shuffle(factions);
      const seats = random.Shuffle([...nationOrder]);

      const owners: Partial<Record<NationId, string>> = {};
      for (const n of nationOrder) owners[n] = 'bot';
      const players: Record<PlayerID, PlayerSecret> = {};
      ids.forEach((id, i) => {
        const nation = seats[i];
        owners[nation] = id;
        const hand = emptyHand();
        for (const r of nations[nation]!.resources) hand[r] = START_EACH;
        players[id] = {
          nation,
          faction: dealt[i],
          hand,
          gold: START_GOLD,
          known: { [nation]: id },
          inbox: [],
          plans: [],
          harvest: { land: emptyHand(), routes: emptyHand() },
          freeTrader: false,
          veto: 0,
          captive: false,
          hostages: [],
          security: 0,
        };
      });

      // The Syndicate knows itself; some Concord members get one trusted partner.
      const syndicate = ids.filter((id) => players[id].faction === 'syndicate');
      for (const a of syndicate) for (const b of syndicate) players[a].known[players[b].nation] = b;
      const concord = random.Shuffle(ids.filter((id) => players[id].faction === 'concord'));
      for (let k = 0; k < table.concordPairs && concord.length >= 2 * (k + 1); k++) {
        const [a, b] = [concord[2 * k], concord[2 * k + 1]];
        players[a].known[players[b].nation] = b;
        players[b].known[players[a].nation] = a;
      }
      for (const id of ids) {
        const p = players[id];
        const partners = Object.entries(p.known).filter(([, who]) => who !== id);
        const allies = partners.map(([n, who]) => `${nations[n as NationId]!.icon} ${nations[n as NationId]!.name} is ${roster[Number(who)].name}`);
        p.inbox.push({
          round: 0,
          text: `You rule ${nations[p.nation]!.icon} ${nations[p.nation]!.name}. ${
            `Your faction: ${FACTION_INFO[p.faction].label}.`
          } ${
            allies.length ? `Trusted: ${allies.join('; ')}.` : 'You trust no one yet.'
          }`,
        });
      }

      return {
        roster,
        tiles,
        nations,
        nationOrder,
        routes: [],
        envoys: [],
        round: 0,
        rolls: [],
        prices: Object.fromEntries(RESOURCES.map((r) => [r, START_PRICE])) as Record<Resource, number>,
        priceChange: {},
        supply: {},
        demand: {},
        news: [
          {
            round: 0,
            items: [{ t: 'prologue', nations: nationOrder.length, players: count }],
          },
        ],
        publicLog: [],
        trades: [],
        entrants: {},
        votes: {},
        settings: { ...settings },
        ready: {},
        handSizes: Object.fromEntries(ids.map((id) => [id, handTotal(players[id].hand)])),
        revealed: {},
        verdicts: [],
        tariffed: {},
        nextId: 1,
        result: null,
        owners,
        players,
        ledgers: Object.fromEntries(ids.map((id) => [id, freshLedger()])),
        kidnaps: [],
      };
    },

    phases: {
      day: {
        start: true,
        next: 'night',
        onBegin: startDay as any,
        onEnd: endDay,
        endIf: allReady,
        turn: { activePlayers: ActivePlayers.ALL },
        moves: { setReady, respondEnvoy, proposeTrade, respondTrade, cancelTrade, sell, enterTribunal, vote, armVeto, hireSecurity },
      },
      night: {
        next: 'day',
        onBegin: startNight,
        onEnd: resolveNight as any,
        endIf: allReady,
        turn: { activePlayers: ActivePlayers.ALL },
        moves: { setReady, respondEnvoy, planEnvoy, planRoute, planFactory, planSpy, planSmuggle, planPump, planKidnap, hireSecurity, cancelPlan },
      },
    },

    endIf: ({ G }) => G.result ?? undefined,

    // Each player sees only their own secrets, plus whatever they have learned.
    playerView: ({ G, playerID }) => {
      if (G.result) return G;
      const mine = playerID != null ? G.players[playerID] : undefined;
      const owners: GState['owners'] = {};
      if (mine) Object.assign(owners, mine.known);
      for (const [pid, rev] of Object.entries(G.revealed)) owners[rev.nation] = pid;
      return { ...G, owners, players: mine ? { [playerID!]: mine } : {}, ledgers: {}, kidnaps: [] };
    },
  };
}
