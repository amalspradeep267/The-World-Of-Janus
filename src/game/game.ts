import type { FnContext, Game, PlayerID as BgioPlayerID } from 'boardgame.io';
import { ActivePlayers, INVALID_MOVE } from 'boardgame.io/core';
import {
  BASE_INCOME,
  BOT,
  COST,
  DICE_YIELD,
  FACTION_INFO,
  HARVEST_ROLLS,
  MAP_RADIUS,
  MAX_GOODS_PER_ROUTE,
  MAX_PLAYERS,
  MAX_ROUTES_PER_CITY,
  MAX_ROUNDS,
  MIN_PLAYERS,
  PERSONAS,
  PRICE_CAP_PCT,
  PRICE_STEP_PCT,
  PUMP,
  RECIPE,
  RESOURCES,
  RESOURCE_INFO,
  SETUP_TABLE,
  SMUGGLE_MARKUP,
  START_EACH,
  START_GOLD,
  START_PRICE,
  TRADER_GOAL,
  TRIBUNAL_FROM_ROUND,
  WRONG_EXPOSURES_TO_LOSE,
  type Faction,
  type NationId,
  type Resource,
} from './constants';
import { generateMap, type Rng } from './map';
import type { GameResult, GState, Hand, NewsItem, PlayerID, PlayerSecret, Route } from './types';

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

const persona = (G: GState, pid: PlayerID) => {
  const e = G.roster.find((p) => p.id === pid)!;
  return `${e.persona} (${e.name})`;
};

export const routeCount = (G: GState, n: NationId) => G.routes.filter((rt) => rt.a === n || rt.b === n).length;

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

const pendingBetween = (G: GState, x: NationId, y: NationId) =>
  G.envoys.some((e) => e.status === 'pending' && ((e.from === x && e.to === y) || (e.from === y && e.to === x)));

const humans = (G: GState) => G.roster.map((p) => p.id);

function tradeVolume(G: GState, n: NationId) {
  return G.routes.filter((rt) => rt.a === n || rt.b === n).reduce((s, rt) => s + rt.goods.length, 0);
}

function finalResult(G: GState, winners: Faction[], reason: string): GameResult {
  const trader = humans(G).find((pid) => G.players[pid].faction === 'trader');
  if (trader && tradeVolume(G, G.players[trader].nation) >= TRADER_GOAL) {
    winners = [...winners, 'trader'];
    reason += ` The Free Trader also hit their trade goal.`;
  }
  return { winners, reason };
}

// ---------- phase hooks ----------

function startDay({ G, random }: { G: GState; random: Rng & { D6(): number } }) {
  if (G.result) return;
  G.round += 1;
  G.votes = {};
  G.ready = {};
  G.trades = G.trades.filter((t) => t.status === 'open'); // (always empty here; kept for safety)

  G.dice = Array.from({ length: HARVEST_ROLLS }, () => [random.D6(), random.D6()] as [number, number]);
  G.rolls = G.dice.map(([a, b]) => a + b);

  const gains: Partial<Record<NationId, Hand>> = {};
  for (const n of G.nationOrder) {
    const g = emptyHand();
    for (const r of G.nations[n]!.resources) g[r] += BASE_INCOME;
    for (const ti of G.nations[n]!.tiles) {
      const tile = G.tiles[ti];
      const hits = G.rolls.filter((roll) => roll === tile.number).length;
      g[tile.resource!] += hits * DICE_YIELD;
    }
    gains[n] = g;
  }
  // Open trade routes: whenever your partner harvests a traded good, you receive one too.
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
    const routePart = handTotal(b) > 0 ? ` Trade routes brought in ${formatGoods(b)}.` : '';
    p.inbox.push({ round: G.round, text: `Harvest: ${formatGoods(g)}.${routePart}` });
  }
  snapshotHands(G);
}

function endDay({ G }: { G: GState }) {
  for (const t of G.trades) if (t.status === 'open') t.status = 'expired';
  G.trades = [];

  if (G.round >= TRIBUNAL_FROM_ROUND) {
    const tally: Record<PlayerID, number> = {};
    for (const target of Object.values(G.votes)) if (target != null) tally[target] = (tally[target] ?? 0) + 1;
    const majority = Math.floor(G.roster.length / 2) + 1;
    const exposed = Object.keys(tally).find((pid) => tally[pid] >= majority && !G.revealed[pid]);
    if (Object.keys(tally).length > 0) G.verdicts.push({ round: G.round, target: exposed ?? null });
    if (exposed) {
      const p = G.players[exposed];
      G.revealed[exposed] = { nation: p.nation, faction: p.faction };
      G.publicLog.push({
        round: G.round,
        text: `⚖️ The Tribunal exposed ${persona(G, exposed)}: they rule ${icon(G, p.nation)} and serve the ${FACTION_INFO[p.faction].label}.`,
      });
      if (p.faction !== 'pact') G.wrongExposures += 1;
      const pactLeft = humans(G).filter((pid) => G.players[pid].faction === 'pact' && !G.revealed[pid]);
      if (G.wrongExposures >= WRONG_EXPOSURES_TO_LOSE) {
        G.result = finalResult(G, ['pact'], 'The Tribunal exposed an innocent. The Iron Pact wins.');
      } else if (pactLeft.length === 0) {
        G.result = finalResult(G, ['concord'], 'Every Iron Pact player was exposed. The Concord wins.');
      }
    } else if (Object.keys(tally).length > 0) {
      G.publicLog.push({ round: G.round, text: '⚖️ The Tribunal could not reach a majority.' });
    }
  }
  G.votes = {};
  G.ready = {};
}

function startNight({ G }: { G: GState }) {
  G.ready = {};
}

function resolveNight({ G, random }: { G: GState; random: Rng }) {
  const items: NewsItem[] = [];

  // Player actions, in shuffled order so the news order leaks nothing.
  for (const pid of random.Shuffle(humans(G))) {
    const p = G.players[pid];
    for (const plan of p.plans) {
      if (plan.kind === 'envoy') {
        if (findRoute(G, p.nation, plan.to) || pendingBetween(G, p.nation, plan.to) || routeCount(G, p.nation) >= MAX_ROUTES_PER_CITY) {
          refund(p, plan.paid);
          p.inbox.push({ round: G.round, text: `Your envoy to ${icon(G, plan.to)} was recalled (already in contact). Refunded.` });
          continue;
        }
        G.envoys.push({ id: G.nextId++, from: p.nation, to: plan.to, sentRound: G.round, status: 'pending' });
        items.push({ t: 'envoy', from: p.nation, to: plan.to });
      } else if (plan.kind === 'route') {
        const rt = findRoute(G, p.nation, plan.with);
        if (!rt || rt.goods.includes(plan.good) || rt.goods.length >= MAX_GOODS_PER_ROUTE) {
          refund(p, plan.paid);
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
      } else {
        const truth = G.owners[plan.nation] === plan.suspect;
        p.inbox.push({
          round: G.round,
          text: `🕵️ Your spies report: ${icon(G, plan.nation)} is ${truth ? '' : 'NOT '}controlled by ${persona(G, plan.suspect)}.`,
        });
        if (truth) p.known[plan.nation] = plan.suspect;
        items.push({ t: 'spy', nation: plan.nation });
      }
      if ('paid' in plan) for (const r of RESOURCES) if (plan.paid[r]) addDemand(G, r, plan.paid[r]!);
    }
    p.plans = [];
  }

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

  // Markets.
  G.priceChange = {};
  for (const r of RESOURCES) {
    const net = G.demand[r] ?? 0;
    if (net === 0) continue;
    const pct = Math.max(-PRICE_CAP_PCT, Math.min(PRICE_CAP_PCT, net * PRICE_STEP_PCT));
    G.prices[r] = Math.max(1, Math.round(G.prices[r] * (1 + pct / 100) * 10) / 10);
    G.priceChange[r] = pct;
  }
  G.demand = {};

  const news = random.Shuffle(items);
  if (news.length === 0) news.push({ t: 'quiet' });
  if (Object.keys(G.priceChange).length) news.push({ t: 'market', changes: { ...G.priceChange } });
  G.news.push({ round: G.round, items: news });
  G.ready = {};

  if (!G.result && G.round >= MAX_ROUNDS) {
    const hidden = humans(G).filter((pid) => G.players[pid].faction === 'pact' && !G.revealed[pid]);
    G.result = finalResult(
      G,
      hidden.length ? ['pact'] : ['concord'],
      hidden.length
        ? 'Time ran out with Iron Pact players still hidden. The Iron Pact wins.'
        : 'The Iron Pact was fully exposed. The Concord wins.',
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
        ? `You accepted the envoy from ${icon(G, e.from)}. Its seal bears no persona: no player rules it.`
        : `You accepted the envoy from ${icon(G, e.from)}. It was sent by ${persona(G, sender)}.`,
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
  moveGoods(from.hand, to.hand, t.give);
  moveGoods(to.hand, from.hand, t.get);
  t.status = 'accepted';
  snapshotHands(G);
  G.publicLog.push({
    round: G.round,
    text: `🔁 ${persona(G, t.from)} traded ${formatGoods(t.give)} to ${persona(G, t.to)} for ${formatGoods(t.get)}.`,
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
  const earned = Math.floor(G.prices[resource] * qty);
  p.gold += earned;
  addDemand(G, resource, -qty);
  snapshotHands(G);
  G.publicLog.push({
    round: G.round,
    text: `💰 ${persona(G, playerID!)} sold ${qty} ${RESOURCE_INFO[resource].emoji} ${RESOURCE_INFO[resource].label} for ${earned} gold.`,
  });
});

const vote = hostOnly(({ G, playerID }, target: PlayerID | null) => {
  if (playerID == null || !G.players[playerID] || G.round < TRIBUNAL_FROM_ROUND) return INVALID_MOVE;
  if (target != null && (target === playerID || !G.players[target] || G.revealed[target])) return INVALID_MOVE;
  G.votes[playerID] = target;
});

const planEnvoy = hostOnly(({ G, playerID }, to: NationId) => {
  const p = me(G, playerID);
  if (!p || !G.nations[to] || to === p.nation) return INVALID_MOVE;
  if (findRoute(G, p.nation, to) || pendingBetween(G, p.nation, to)) return INVALID_MOVE;
  if (p.plans.some((x) => x.kind === 'envoy' && x.to === to)) return INVALID_MOVE;
  const planned = p.plans.filter((x) => x.kind === 'envoy').length;
  if (routeCount(G, p.nation) + planned >= MAX_ROUTES_PER_CITY) return INVALID_MOVE;
  const paid = { ...RECIPE.envoy };
  if (!hasGoods(p.hand, paid)) return INVALID_MOVE;
  moveGoods(p.hand, null, paid);
  p.plans.push({ kind: 'envoy', to, paid });
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
  if (!hasGoods(p.hand, paid)) return INVALID_MOVE;
  moveGoods(p.hand, null, paid);
  p.plans.push({ kind: 'route', with: partner, good, paid });
});

const planSpy = hostOnly(({ G, playerID }, nation: NationId, suspect: PlayerID) => {
  const p = me(G, playerID);
  if (!p || !G.nations[nation] || nation === p.nation || !G.players[suspect] || suspect === playerID) {
    return INVALID_MOVE;
  }
  if (p.gold < COST.spyGold) return INVALID_MOVE;
  p.gold -= COST.spyGold;
  p.plans.push({ kind: 'spy', nation, suspect, gold: COST.spyGold });
});

const planSmuggle = hostOnly(({ G, playerID }, good: Resource) => {
  const p = me(G, playerID);
  if (!p || !RESOURCES.includes(good)) return INVALID_MOVE;
  const gold = smugglePrice(G, good);
  if (p.gold < gold) return INVALID_MOVE;
  p.gold -= gold;
  p.plans.push({ kind: 'smuggle', good, gold });
});

const planPump = hostOnly(({ G, playerID }, good: Resource) => {
  const p = me(G, playerID);
  if (!p || !RESOURCES.includes(good) || p.gold < PUMP.gold) return INVALID_MOVE;
  p.gold -= PUMP.gold;
  p.plans.push({ kind: 'pump', good, gold: PUMP.gold });
});

const cancelPlan = hostOnly(({ G, playerID }, index: number) => {
  const p = me(G, playerID);
  const plan = p?.plans[index];
  if (!p || !plan) return INVALID_MOVE;
  if ('gold' in plan) p.gold += plan.gold;
  else refund(p, plan.paid);
  p.plans.splice(index, 1);
});

// ---------- the game ----------

const allReady = ({ G }: { G: GState }) => G.roster.every((p) => G.ready[p.id]);

/**
 * Builds the game for a given roster. The P2P transport can't pass setup data,
 * so the friend names (shared through the room link) are baked in here.
 */
export function makeGame(names: string[]): Game<GState> {
  return {
    name: GAME_NAME,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,

    setup: ({ ctx, random }) => {
      const count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, ctx.numPlayers));
      const table = SETUP_TABLE[count];
      const { tiles, nations, nationOrder } = generateMap(random, table.nations, MAP_RADIUS);

      const ids = Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
      const personas = random.Shuffle([...PERSONAS]);
      const roster = ids.map((id, i) => ({ id, name: names[i] ?? `Player ${i + 1}`, persona: personas[i] }));

      const factions: Faction[] = [
        ...Array(table.pact).fill('pact'),
        ...Array(table.trader).fill('trader'),
        ...Array(count - table.pact - table.trader).fill('concord'),
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
        };
      });

      // The Pact knows itself; some Concord members get one trusted partner.
      const pact = ids.filter((id) => players[id].faction === 'pact');
      for (const a of pact) for (const b of pact) players[a].known[players[b].nation] = b;
      const concord = random.Shuffle(ids.filter((id) => players[id].faction === 'concord'));
      for (let k = 0; k < table.concordPairs && concord.length >= 2 * (k + 1); k++) {
        const [a, b] = [concord[2 * k], concord[2 * k + 1]];
        players[a].known[players[b].nation] = b;
        players[b].known[players[a].nation] = a;
      }
      for (const id of ids) {
        const p = players[id];
        const partners = Object.entries(p.known).filter(([, who]) => who !== id);
        const allies = partners.map(([n, who]) => `${nations[n as NationId]!.icon} ${nations[n as NationId]!.name} is ${roster[Number(who)].persona} (${roster[Number(who)].name})`);
        p.inbox.push({
          round: 0,
          text: `You rule ${nations[p.nation]!.icon} ${nations[p.nation]!.name}. ${
            p.faction === 'trader' ? 'You are a Free Trader and answer to no one.' : `You serve the ${FACTION_INFO[p.faction].label}.`
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
        dice: [],
        rolls: [],
        prices: Object.fromEntries(RESOURCES.map((r) => [r, START_PRICE])) as Record<Resource, number>,
        priceChange: {},
        demand: {},
        news: [
          {
            round: 0,
            items: [{ t: 'prologue', nations: nationOrder.length, players: count }],
          },
        ],
        publicLog: [],
        trades: [],
        votes: {},
        ready: {},
        handSizes: Object.fromEntries(ids.map((id) => [id, handTotal(players[id].hand)])),
        revealed: {},
        verdicts: [],
        wrongExposures: 0,
        nextId: 1,
        result: null,
        owners,
        players,
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
        moves: { setReady, respondEnvoy, proposeTrade, respondTrade, cancelTrade, sell, vote },
      },
      night: {
        next: 'day',
        onBegin: startNight,
        onEnd: resolveNight as any,
        endIf: allReady,
        turn: { activePlayers: ActivePlayers.ALL },
        moves: { setReady, respondEnvoy, planEnvoy, planRoute, planSpy, planSmuggle, planPump, cancelPlan },
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
      return { ...G, owners, players: mine ? { [playerID!]: mine } : {} };
    },
  };
}
