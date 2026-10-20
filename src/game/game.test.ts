import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { describe, expect, it } from 'vitest';
import { DICE_YIELD, DISTANCE, FACTORY, KIDNAP, SECURITY, SPY, MAX_GOODS_PER_ROUTE, MAX_ROUNDS, MAX_ROUTES_PER_CITY, PUMP, RECIPE, RESOURCES, SETUP_TABLE, TARIFF, TRIBUNAL, type Resource } from './constants';
import { cityDistance, distanceGold, factoryCost, findRoute, handTotal, hasGoods, makeGame, routeCount, smugglePrice, spendable } from './game';
import type { GState, Hand } from './types';

function startMatch(n: number, id = `m${n}-${Math.random()}`, revealFaction = true) {
  const game = makeGame(Array.from({ length: n }, (_, i) => `P${i}`), { revealFaction });
  const multiplayer = Local();
  const clients = Array.from({ length: n }, (_, i) =>
    Client({ game, numPlayers: n, playerID: String(i), multiplayer, matchID: id }),
  );
  clients.forEach((c) => c.start());
  return clients;
}

type C = ReturnType<typeof startMatch>[number];
const view = (c: C) => c.getState()!.G as GState;
const phaseOf = (c: C) => c.getState()!.ctx.phase;
const allReady = (clients: C[]) => clients.forEach((c) => c.moves.setReady(true));

/** First recipe ingredient the hand is missing, if any. */
const missing = (hand: Hand, recipe: Partial<Hand>) =>
  (Object.keys(recipe) as Resource[]).find((r) => hand[r] < (recipe[r] ?? 0));

describe('The World of Janus', () => {
  it('keeps other players secret in each player view', () => {
    const clients = startMatch(4);
    const G0 = view(clients[0]);
    expect(Object.keys(G0.players)).toEqual(['0']);
    expect(G0.nationOrder.length).toBe(SETUP_TABLE[4].nations);
    // Card counts are public even though hands are not.
    expect(Object.keys(G0.handSizes).length).toBe(4);
  });

  it('deals each city distinct harvest numbers from a 12-sided die', () => {
    for (let k = 0; k < 20; k++) {
      const G = view(startMatch(8)[0]);
      for (const n of G.nationOrder) {
        const nums = G.nations[n]!.tiles.map((t) => G.tiles[t].number!);
        expect(new Set(nums).size).toBe(nums.length);
        for (const x of nums) expect(x >= 1 && x <= 12).toBe(true);
      }
    }
  });

  for (const n of [3, 4, 5, 8]) {
    it(`plays a full ${n}-player game to a result within the route caps`, () => {
      const clients = startMatch(n);
      for (let guard = 0; guard < 200 && !clients[0].getState()!.ctx.gameover; guard++) {
        const phase = phaseOf(clients[0]);
        clients.forEach((c, i) => {
          const G = view(c);
          const p = G.players[String(i)];
          if (phase === 'day') {
            for (const e of G.envoys) if (e.to === p.nation && e.status === 'pending') c.moves.respondEnvoy(e.id, i % 2 === 0);
            // Ask the next player for whatever the envoy recipe still needs.
            const need = missing(p.hand, RECIPE.envoy);
            const spare = RESOURCES.find((r) => p.hand[r] > 1);
            if (need && spare) c.moves.proposeTrade(String((i + 1) % n), { [spare]: 1 }, { [need]: 1 });
            for (const t of view(c).trades) if (t.to === String(i) && t.status === 'open') c.moves.respondTrade(t.id, true);
            if (view(c).round >= 3) {
              c.moves.enterTribunal();
              c.moves.vote(String((i + 1) % n));
            }
          } else {
            const target = G.nationOrder.find((x) => x !== p.nation && !findRoute(G, p.nation, x));
            if (target && hasGoods(p.hand, RECIPE.envoy)) c.moves.planEnvoy(target);
            const need = missing(view(c).players[String(i)].hand, RECIPE.route);
            if (need) c.moves.planSmuggle(need);
            const rt = G.routes.find((r) => r.a === p.nation || r.b === p.nation);
            if (rt) {
              const other = rt.a === p.nation ? rt.b : rt.a;
              const good = G.nations[p.nation]!.resources.find((g) => !rt.goods.includes(g));
              if (good) c.moves.planRoute(other, good);
            }
            if (i === 0) c.moves.planPump('silk');
          }
          c.moves.setReady(true);
        });
      }
      const state = clients[0].getState()!;
      expect(state.ctx.gameover).toBeTruthy();
      const G = state.G as GState;
      expect(G.round).toBeLessThanOrEqual(MAX_ROUNDS);
      expect(Object.keys(G.players).length).toBe(n); // everything is revealed at the end
      for (const nation of G.nationOrder) expect(routeCount(G, nation)).toBeLessThanOrEqual(MAX_ROUTES_PER_CITY);
      for (const rt of G.routes) expect(rt.goods.length).toBeLessThanOrEqual(MAX_GOODS_PER_ROUTE);
      for (const p of Object.values(G.players)) {
        for (const r of RESOURCES) expect(p.hand[r]).toBeGreaterThanOrEqual(0);
        expect(p.gold).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it('requires the exact envoy recipe', () => {
    const clients = startMatch(4);
    allReady(clients); // -> night 1
    for (let i = 0; i < 4; i++) {
      const G = view(clients[i]);
      const p = G.players[String(i)];
      const target = G.nationOrder.find((x) => x !== p.nation)!;
      const before = handTotal(p.hand);
      clients[i].moves.planEnvoy(target);
      const after = view(clients[i]).players[String(i)];
      if (hasGoods(p.hand, RECIPE.envoy)) {
        expect(handTotal(after.hand)).toBe(before - handTotal(RECIPE.envoy));
        expect(after.plans).toHaveLength(1);
      } else {
        expect(handTotal(after.hand)).toBe(before);
        expect(after.plans).toHaveLength(0);
      }
    }
  });

  it('lets only the Syndicate smuggle and pump', () => {
    const clients = startMatch(4);
    allReady(clients); // -> night 1
    const views = clients.map((c, i) => view(c).players[String(i)]);
    const s = views.findIndex((p) => p.faction === 'syndicate');
    const other = views.findIndex((p) => p.faction !== 'syndicate');
    clients[other].moves.planSmuggle('ore');
    clients[other].moves.planPump('silk');
    expect(view(clients[other]).players[String(other)].plans).toHaveLength(0);

    const G = view(clients[s]);
    const price = smugglePrice(G, 'ore');
    const gold = G.players[String(s)].gold;
    const ore = G.players[String(s)].contraband.ore;
    const handOre = G.players[String(s)].hand.ore;
    clients[s].moves.planSmuggle('ore');
    expect(view(clients[s]).players[String(s)].gold).toBe(gold - price);
    if (view(clients[s]).players[String(s)].gold >= PUMP.gold) clients[s].moves.planPump('silk');
    allReady(clients); // -> day 2: delivery, into the hidden stash
    const after = view(clients[s]).players[String(s)];
    expect(after.contraband.ore).toBe(ore + 1);
    expect(after.hand.ore - handOre).toBe(after.harvest.land.ore + after.harvest.routes.ore); // the hand only grew by the harvest
  });

  it('moves prices relative to each other, not all down together', () => {
    const clients = startMatch(5);
    allReady(clients); // -> night 1
    allReady(clients); // -> day 2, after one market update
    const G = view(clients[0]);
    const changes = Object.values(G.priceChange);
    const allDown = changes.length === RESOURCES.length && changes.every((c) => c! < 0);
    const allUp = changes.length === RESOURCES.length && changes.every((c) => c! > 0);
    expect(allDown || allUp).toBe(false);
    for (const r of RESOURCES) expect(Number.isInteger(G.prices[r])).toBe(true);
  });

  it('pays exactly the listed price for a sale', () => {
    const clients = startMatch(3);
    const G = view(clients[0]);
    const r = RESOURCES.find((x) => G.players['0'].hand[x] > 0)!;
    const before = G.players['0'].gold;
    clients[0].moves.sell(r, 1);
    expect(view(clients[0]).players['0'].gold).toBe(before + G.prices[r]);
  });

  it('spies report a treasury, not an identity', () => {
    const clients = startMatch(3);
    // Player 1 sells a card by day, then player 0 spies on player 1's city at night.
    const G1 = view(clients[1]);
    const r = RESOURCES.find((x) => G1.players['1'].hand[x] > 0)!;
    const earned = G1.prices[r];
    clients[1].moves.sell(r, 1);
    allReady(clients); // -> night 1
    const target = view(clients[1]).players['1'].nation;
    clients[0].moves.planSpy(target);
    allReady(clients); // -> day 2
    const me = view(clients[0]).players['0'];
    const report = me.inbox.find((m) => m.text.startsWith('💰'))!;
    expect(report.text).toContain(`received ${earned} gold and spent 0 gold`);
    expect(me.known[target]).toBeUndefined(); // no identity leak
    expect(me.gold).toBeLessThanOrEqual(15 - SPY.treasury);
  });

  it('puts a tariff on an exposed innocent instead of ending the game', () => {
    const clients = startMatch(4);
    const factions = clients.map((c, i) => view(c).players[String(i)].faction);
    const innocent = factions.findIndex((f) => f !== 'syndicate');
    for (let k = 0; k < 4; k++) allReady(clients); // reach day 3, when the Tribunal opens
    expect(view(clients[0]).round).toBe(3);
    clients.forEach((c, i) => {
      if (i === innocent) return;
      c.moves.enterTribunal();
      c.moves.vote(String(innocent));
    });
    allReady(clients); // dusk: verdict
    expect(view(clients[0]).tariffed[String(innocent)]).toBe(true);
    expect(clients[0].getState()!.ctx.gameover).toBeFalsy();

    // Their next trade costs them the tariff.
    allReady(clients); // -> day 4
    const partner = (innocent + 1) % 4;
    const mine = view(clients[innocent]).players[String(innocent)];
    const theirs = view(clients[partner]).players[String(partner)];
    const give = RESOURCES.find((r) => mine.hand[r] > 0)!;
    const get = RESOURCES.find((r) => theirs.hand[r] > 0)!;
    clients[innocent].moves.proposeTrade(String(partner), { [give]: 1 }, { [get]: 1 });
    const offer = view(clients[partner]).trades.find((t) => t.from === String(innocent))!;
    clients[partner].moves.respondTrade(offer.id, true);
    expect(view(clients[innocent]).players[String(innocent)].gold).toBe(mine.gold - TARIFF.tradeGold);
  });

  it('freezes public card counts during the night', () => {
    const clients = startMatch(3);
    allReady(clients); // -> night 1
    const before = { ...view(clients[0]).handSizes };
    clients[0].moves.planSmuggle('grain');
    const G = view(clients[0]);
    const target = G.nationOrder.find((x) => x !== G.players['0'].nation)!;
    clients[0].moves.planEnvoy(target);
    expect(view(clients[1]).handSizes).toEqual(before);
  });

  it('reveals the sender persona only to the receiver who accepts', () => {
    // Find a match where some player can afford an envoy on night 1 to a city another player rules.
    for (let attempt = 0; attempt < 50; attempt++) {
      const clients = startMatch(4);
      allReady(clients); // day 1 -> night 1
      const senderIdx = clients.findIndex((c, i) => hasGoods(view(c).players[String(i)].hand, RECIPE.envoy));
      if (senderIdx < 0) continue;
      const receiverIdx = (senderIdx + 1) % 4;
      const watcherIdx = (senderIdx + 2) % 4;
      const sender = clients[senderIdx];
      const mine = view(sender).players[String(senderIdx)].nation;
      const target = view(clients[receiverIdx]).players[String(receiverIdx)].nation;
      sender.moves.planEnvoy(target);
      allReady(clients); // night 1 -> day 2
      const envoy = view(clients[receiverIdx]).envoys.find((e) => e.from === mine && e.to === target);
      expect(envoy?.status).toBe('pending');
      clients[receiverIdx].moves.respondEnvoy(envoy!.id, true);
      expect(view(clients[receiverIdx]).owners[mine]).toBe(String(senderIdx));
      const watcher = view(clients[watcherIdx]).players[String(watcherIdx)];
      if (watcher.faction !== 'syndicate') expect(view(clients[watcherIdx]).owners[mine]).toBeUndefined();
      return;
    }
    throw new Error('no match produced an affordable envoy');
  });

  // ---------- distance ----------

  it('charges more gold for envoys to far-away cities', () => {
    const clients = startMatch(4);
    allReady(clients); // -> night 1
    for (let i = 0; i < 4; i++) {
      const G = view(clients[i]);
      const p = G.players[String(i)];
      if (!hasGoods(p.hand, RECIPE.envoy)) continue;
      // Pick the farthest city to make the surcharge visible.
      const far = [...G.nationOrder].filter((n) => n !== p.nation).sort((a, b) => cityDistance(G, p.nation, b) - cityDistance(G, p.nation, a))[0];
      const extra = distanceGold(G, p.nation, far);
      expect(extra).toBe(Math.max(0, cityDistance(G, p.nation, far) - DISTANCE.freeHexes) * DISTANCE.goldPerHex);
      clients[i].moves.planEnvoy(far);
      expect(view(clients[i]).players[String(i)].gold).toBe(p.gold - extra);
      clients[i].moves.cancelPlan(0);
      expect(view(clients[i]).players[String(i)].gold).toBe(p.gold); // refunded
      return;
    }
  });

  // ---------- tribunal ----------

  /** Start a match and advance to day 3, when the Tribunal opens. */
  function toTribunal(n: number, revealFaction = true) {
    const clients = startMatch(n, undefined, revealFaction);
    for (let k = 0; k < 4; k++) allReady(clients);
    expect(view(clients[0]).round).toBe(3);
    const factions = clients.map((c, i) => view(c).players[String(i)].faction);
    return { clients, factions };
  }
  const gold = (c: C, i: number) => view(c).players[String(i)].gold;

  it('does not sit with fewer than three entrants, and refunds them', () => {
    const { clients } = toTribunal(4);
    const g0 = gold(clients[0], 0);
    clients[0].moves.enterTribunal();
    clients[1].moves.enterTribunal();
    expect(gold(clients[0], 0)).toBe(g0 - TRIBUNAL.entryGold);
    clients[0].moves.vote('1');
    clients[1].moves.vote('0');
    allReady(clients); // dusk
    const G = view(clients[0]);
    expect(G.verdicts.at(-1)!.convened).toBe(false);
    expect(Object.keys(G.revealed)).toHaveLength(0);
    expect(gold(clients[0], 0)).toBe(g0);
  });

  it('only lets entrants vote, and a majority of entrants decides', () => {
    const { clients, factions } = toTribunal(5);
    const target = factions.findIndex((f) => f !== 'syndicate');
    const voters = [0, 1, 2, 3, 4].filter((i) => i !== target).slice(0, 3);
    clients[target].moves.vote(String(voters[0])); // not an entrant: ignored
    expect(view(clients[0]).votes[String(target)]).toBeUndefined();
    // 3 entrants, 2 accuse: a majority of entrants even though 2 of 5 players is not a majority of the table.
    for (const i of voters) clients[i].moves.enterTribunal();
    clients[voters[0]].moves.vote(String(target));
    clients[voters[1]].moves.vote(String(target));
    allReady(clients);
    const G = view(clients[0]);
    const v = G.verdicts.at(-1)!;
    if (v.vetoed) return; // the Free Trader may have been an entrant with a veto (not armed here, so this shouldn't happen)
    expect(v.target).toBe(String(target));
    expect(G.revealed[String(target)]).toBeTruthy();
  });

  it('fines the voters who expose an innocent', () => {
    const { clients, factions } = toTribunal(4);
    const innocent = factions.findIndex((f) => f !== 'syndicate');
    const voters = [0, 1, 2, 3].filter((i) => i !== innocent);
    const before = voters.map((i) => gold(clients[i], i));
    for (const i of voters) {
      clients[i].moves.enterTribunal();
      clients[i].moves.vote(String(innocent));
    }
    allReady(clients);
    const v = view(clients[0]).verdicts.at(-1)!;
    expect(v.target).toBe(String(innocent));
    expect([...v.fined].sort()).toEqual(voters.map(String).sort());
    voters.forEach((i, k) => expect(gold(clients[i], i)).toBe(before[k] - TRIBUNAL.entryGold - TRIBUNAL.innocentFine));
  });

  it('keeps the veto for holders of the Free Trader title', () => {
    const { clients } = toTribunal(4);
    for (const i of [0, 1, 2]) clients[i].moves.enterTribunal();
    const g = gold(clients[0], 0);
    clients[0].moves.armVeto(true); // no title yet
    expect(gold(clients[0], 0)).toBe(g);
    expect(view(clients[0]).players['0'].veto).toBe(0);
  });

  it("lets a Free Trader's secret veto strike a verdict down", () => {
    // Give player 0 a ready-made trade empire so they earn the title on the first night.
    const base = makeGame(['P0', 'P1', 'P2', 'P3']);
    const game = {
      ...base,
      setup: (ctx: any) => {
        const G = (base.setup as any)(ctx) as GState;
        const mine = G.players['0'].nation;
        const others = G.nationOrder.filter((n) => n !== mine).slice(0, 4);
        for (const [k, n] of others.entries()) {
          G.routes.push({ a: mine, b: n, goods: [RESOURCES[k], RESOURCES[k + 1]].slice(0, k < 3 ? 2 : 1) });
        }
        return G;
      },
    };
    const multiplayer = Local();
    const matchID = `veto-${Math.random()}`;
    const clients = [0, 1, 2, 3].map((i) => Client({ game, numPlayers: 4, playerID: String(i), multiplayer, matchID }));
    clients.forEach((c) => c.start());
    allReady(clients); // -> night 1
    allReady(clients); // -> day 2: the title is awarded at the end of the night
    expect(view(clients[0]).players['0'].freeTrader).toBe(true);
    allReady(clients);
    allReady(clients); // -> day 3
    const target = 1;
    for (const i of [0, 2, 3]) clients[i].moves.enterTribunal();
    for (const i of [2, 3]) clients[i].moves.vote(String(target));
    const g = gold(clients[0], 0);
    clients[0].moves.armVeto(true);
    expect(gold(clients[0], 0)).toBe(g - TRIBUNAL.vetoGold);
    expect(view(clients[2]).players['0']).toBeUndefined(); // nobody else can see it
    allReady(clients);
    const v = view(clients[0]).verdicts.at(-1)!;
    expect(v.vetoed).toBe(true);
    expect(view(clients[0]).revealed[String(target)]).toBeUndefined();
  });

  it('can keep exposed factions secret when the host chooses', () => {
    const { clients, factions } = toTribunal(4, false);
    const target = factions.findIndex((f) => f !== 'syndicate');
    for (const i of [0, 1, 2, 3].filter((x) => x !== target)) {
      clients[i].moves.enterTribunal();
      clients[i].moves.vote(String(target));
    }
    allReady(clients);
    const rev = view(clients[0]).revealed[String(target)];
    expect(rev.nation).toBeTruthy();
    expect(rev.faction).toBeNull();
  });

  // ---------- kidnapping ----------

  function seats(clients: C[]) {
    return clients.map((c, i) => view(c).players[String(i)]);
  }

  it('lets a Syndicate kidnapper collect ransom without revealing who they are', () => {
    const clients = startMatch(4);
    allReady(clients); // -> night 1
    const ps = seats(clients);
    const s = ps.findIndex((p) => p.faction === 'syndicate');
    const v = ps.findIndex((p) => p.faction !== 'syndicate');
    clients[s].moves.planKidnap(ps[v].nation, String(v));
    expect(view(clients[s]).players[String(s)].gold).toBe(15 - KIDNAP.gold);
    allReady(clients); // -> day 2: kidnap resolves, first ransom paid at dawn
    const victim = view(clients[v]).players[String(v)];
    expect(victim.captive).toBe(true);
    expect(victim.gold).toBe(15 - KIDNAP.ransom);
    expect(view(clients[s]).players[String(s)].gold).toBe(15 - KIDNAP.gold + KIDNAP.ransom);
    expect(view(clients[v]).owners[ps[s].nation]).toBeUndefined(); // the victim doesn't learn who
    expect(view(clients[v]).kidnaps).toEqual([]); // and can't read it from the state
    expect(view(clients[0]).news.at(-1)!.items.some((i) => i.t === 'kidnap')).toBe(true);
  });

  it('exposes a kidnapper who guesses wrong', () => {
    const clients = startMatch(4);
    allReady(clients); // -> night 1
    const ps = seats(clients);
    const s = ps.findIndex((p) => p.faction === 'syndicate');
    const v = ps.findIndex((p) => p.faction !== 'syndicate');
    const wrongCity = view(clients[s]).nationOrder.find((n) => n !== ps[v].nation && n !== ps[s].nation)!;
    clients[s].moves.planKidnap(wrongCity, String(v));
    allReady(clients); // -> morning
    const G = view(clients[v]);
    expect(G.revealed[String(s)]).toEqual({ nation: ps[s].nation, faction: 'syndicate' });
    expect(G.news.at(-1)!.items.some((i) => i.t === 'botched')).toBe(true);
    expect(clients[0].getState()!.ctx.gameover).toBeTruthy(); // the only Syndicate member is exposed
  });

  it('only lets the Syndicate kidnap, and never its own members', () => {
    const clients = startMatch(6);
    allReady(clients); // -> night 1
    const ps = seats(clients);
    const [s1, s2] = ps.map((p, i) => (p.faction === 'syndicate' ? i : -1)).filter((i) => i >= 0);
    const c = ps.findIndex((p) => p.faction === 'concord');
    clients[c].moves.planKidnap(ps[s1].nation, String(s1));
    expect(view(clients[c]).players[String(c)].plans).toHaveLength(0);
    clients[s1].moves.planKidnap(ps[s2].nation, String(s2));
    expect(view(clients[s1]).players[String(s1)].plans).toHaveLength(0);
  });

  // ---------- hired security ----------

  /** Kidnap on night 1, then spy on the kidnapper on night 2; optionally hire security first. */
  function spyOnKidnapper(withSecurity: boolean) {
    const clients = startMatch(4);
    allReady(clients); // -> night 1
    const ps = seats(clients);
    const s = ps.findIndex((p) => p.faction === 'syndicate');
    const victim = ps.findIndex((p) => p.faction !== 'syndicate');
    const spy = ps.findIndex((p, i) => p.faction !== 'syndicate' && i !== victim);
    clients[s].moves.planKidnap(ps[victim].nation, String(victim));
    allReady(clients); // -> day 2: the first ransom lands on the kidnapper's ledger
    // Sell a card so there is legal income to report, and gold to pay for security.
    const hand = view(clients[s]).players[String(s)].hand;
    const r = RESOURCES.find((x) => hand[x] > 0)!;
    const sale = view(clients[s]).prices[r];
    clients[s].moves.sell(r, 1);
    if (withSecurity) {
      clients[s].moves.hireSecurity(true);
      expect(view(clients[s]).players[String(s)].security).toBe(SECURITY.gold);
    }
    allReady(clients); // -> night 2
    clients[spy].moves.planSpy(ps[s].nation);
    allReady(clients); // -> day 3
    return { report: view(clients[spy]).players[String(spy)].inbox.find((m) => m.text.startsWith('💰'))!.text, sale };
  }

  it('shows ransom income in spy reports without security', () => {
    const { report, sale } = spyOnKidnapper(false);
    expect(report).toContain(`received ${sale + KIDNAP.ransom} gold`);
  });

  it('bribes spies to leave illegal gold out when security is hired', () => {
    const { report, sale } = spyOnKidnapper(true);
    // Only the legal sale shows; the ransom and the security fee are hidden.
    expect(report).toContain(`received ${sale} gold and spent 0 gold`);
  });

  it('only lets the Syndicate hire security', () => {
    const clients = startMatch(4);
    const c = seats(clients).findIndex((p) => p.faction === 'concord');
    clients[c].moves.hireSecurity(true);
    expect(view(clients[c]).players[String(c)].security).toBe(0);
  });

  // ---------- factories ----------

  /** A 3-player match where player 0 starts with plenty of Ore and Coal. */
  function factoryMatch() {
    const base = makeGame(['P0', 'P1', 'P2']);
    const game = {
      ...base,
      setup: (ctx: any) => {
        const G = (base.setup as any)(ctx) as GState;
        for (const r of RESOURCES) G.players['0'].hand[r] += 20;
        return G;
      },
    };
    const multiplayer = Local();
    const matchID = `factory-${Math.random()}`;
    const clients = [0, 1, 2].map((i) => Client({ game, numPlayers: 3, playerID: String(i), multiplayer, matchID }));
    clients.forEach((c) => c.start());
    return clients;
  }

  it("builds a factory that boosts one of your own tiles when it's rolled", () => {
    const clients = factoryMatch();
    allReady(clients); // -> night 1
    const G = view(clients[0]);
    const nation = G.players['0'].nation;
    const tile = G.nations[nation]!.tiles[1];
    const good = G.tiles[tile].resource!;
    const foreignTile = G.tiles.findIndex((t, i) => t.nation && t.nation !== nation && i >= 0);
    clients[0].moves.planFactory(foreignTile); // not your city
    expect(view(clients[0]).players['0'].plans).toHaveLength(0);
    clients[0].moves.planFactory(tile);
    clients[0].moves.planFactory(tile); // one per tile
    expect(view(clients[0]).players['0'].plans).toHaveLength(1);
    allReady(clients); // -> day 2: built overnight, produces at this dawn
    const after = view(clients[0]);
    expect(after.nations[nation]!.factories).toEqual([{ tile, good }]);
    // Every roll of the tile's number pays the usual yield plus the factory's.
    const hits = after.rolls.filter((r) => r === after.tiles[tile].number).length;
    const sameGoodElsewhere = after.nations[nation]!.tiles
      .filter((t) => t !== tile && after.tiles[t].resource === good)
      .reduce((n, t) => n + after.rolls.filter((r) => r === after.tiles[t].number).length * DICE_YIELD, 0);
    expect(after.players['0'].harvest.land[good]).toBe(hits * (DICE_YIELD + FACTORY.yield) + sameGoodElsewhere);
    expect(after.news.at(-1)!.items.some((i) => i.t === 'factory')).toBe(true);
  });

  it('charges Ore and Coal (plus any tile cost) for a factory', () => {
    const clients = startMatch(3);
    allReady(clients); // -> night 1
    const G = view(clients[0]);
    const p = G.players['0'];
    const tile = G.nations[p.nation]!.tiles[1];
    const cost = factoryCost(G, tile);
    expect(cost.ore).toBeGreaterThanOrEqual(1);
    expect(cost.coal).toBeGreaterThanOrEqual(1);
    expect(cost[G.tiles[tile].resource!]).toBeGreaterThanOrEqual(FACTORY.tileCost);
    clients[0].moves.planFactory(tile);
    expect(view(clients[0]).players['0'].plans).toHaveLength(hasGoods(p.hand, cost) ? 1 : 0);
  });

  it('allows one factory per tile, so three per city', () => {
    const clients = factoryMatch();
    allReady(clients); // -> night 1
    const G = view(clients[0]);
    for (const t of G.nations[G.players['0'].nation]!.tiles) clients[0].moves.planFactory(t);
    expect(view(clients[0]).players['0'].plans.filter((p) => p.kind === 'factory')).toHaveLength(3);
  });

  it('hides who is ready at night, showing only the count', () => {
    const clients = startMatch(4);
    allReady(clients); // -> night 1
    clients[0].moves.setReady(true);
    clients[1].moves.setReady(true);
    const G2 = view(clients[2]);
    expect(G2.readyCount).toBe(2);
    expect(Object.keys(G2.ready)).toHaveLength(0); // player 2 isn't ready, and can't see who is
    expect(view(clients[0]).ready).toEqual({ '0': true }); // you still see your own status
  });

  // ---------- harvest ----------

  it('rolls three d12 each dawn and only rolled tiles produce', () => {
    const clients = startMatch(4);
    const G = view(clients[0]);
    expect(G.rolls).toHaveLength(3);
    const p = G.players['0'];
    for (const t of G.nations[p.nation]!.tiles) {
      const r = G.tiles[t].resource!;
      const hits = G.rolls.filter((x) => x === G.tiles[t].number).length;
      expect(p.harvest.land[r]).toBe(hits * DICE_YIELD);
    }
  });

  it('only updates public card counts at dawn', () => {
    const clients = startMatch(3);
    const before = { ...view(clients[0]).handSizes };
    const hand = view(clients[0]).players['0'].hand;
    const r = RESOURCES.find((x) => hand[x] > 0)!;
    clients[0].moves.sell(r, 1); // a public sale by day
    expect(view(clients[1]).handSizes).toEqual(before);
    allReady(clients); // -> night
    allReady(clients); // -> dawn: now it updates
    expect(view(clients[1]).handSizes['0']).toBe(handTotal(view(clients[0]).players['0'].hand));
  });

  // ---------- contraband ----------

  /** A 4-player match where the Syndicate starts with gold and a stocked stash. */
  function stashMatch() {
    const base = makeGame(['P0', 'P1', 'P2', 'P3']);
    const game = {
      ...base,
      setup: (ctx: any) => {
        const G = (base.setup as any)(ctx) as GState;
        for (const id of Object.keys(G.players)) {
          if (G.players[id].faction === 'syndicate') {
            G.players[id].contraband.grain = 2;
            G.players[id].contraband.wool = 2;
            G.players[id].contraband.silk = 2;
          }
          G.players[id].gold = 60;
        }
        return G;
      },
    };
    const multiplayer = Local();
    const matchID = `stash-${Math.random()}`;
    const clients = [0, 1, 2, 3].map((i) => Client({ game, numPlayers: 4, playerID: String(i), multiplayer, matchID }));
    clients.forEach((c) => c.start());
    const ps = clients.map((c, i) => view(c).players[String(i)]);
    const s = ps.findIndex((p) => p.faction === 'syndicate');
    return { clients, s, ps };
  }

  it('keeps contraband out of the public card count and pays envoys from it first', () => {
    const { clients, s, ps } = stashMatch();
    expect(view(clients[(s + 1) % 4]).handSizes[String(s)]).toBe(handTotal(ps[s].hand)); // stash not counted
    allReady(clients); // -> night 1
    const me = view(clients[s]).players[String(s)];
    const target = view(clients[s]).nationOrder.find((n) => n !== me.nation)!;
    const handBefore = { ...me.hand };
    clients[s].moves.planEnvoy(target);
    const after = view(clients[s]).players[String(s)];
    expect(after.contraband.grain).toBe(1);
    expect(after.contraband.wool).toBe(1);
    expect(after.hand).toEqual(handBefore); // the visible hand didn't pay
    clients[s].moves.cancelPlan(0);
    expect(view(clients[s]).players[String(s)].contraband.grain).toBe(2); // refunds go back to the stash
  });

  it('delivers traded contraband as ordinary goods, invisible to customs', () => {
    const { clients, s } = stashMatch();
    const other = (s + 1) % 4;
    const theirs = view(clients[other]).players[String(other)].hand;
    const want = RESOURCES.find((r) => theirs[r] > 0 && r !== 'silk')!;
    clients[s].moves.proposeTrade(String(other), { silk: 1 }, { [want]: 1 }, { silk: 1 });
    const offer = view(clients[other]).trades.find((t) => t.from === String(s))!;
    expect(offer).not.toHaveProperty('fromStash'); // nothing public says it's contraband
    const silkBefore = view(clients[other]).players[String(other)].hand.silk;
    clients[other].moves.respondTrade(offer.id, true);
    const recv = view(clients[other]).players[String(other)];
    expect(recv.hand.silk).toBe(silkBefore + 1);
    expect(handTotal(recv.contraband)).toBe(0);
    expect(view(clients[s]).players[String(s)].contraband.silk).toBe(1);
    // Customs on the receiver finds nothing.
    allReady(clients); // -> night 1
    const spy = (s + 2) % 4;
    clients[spy].moves.planSpy(recv.nation, 'customs');
    allReady(clients); // -> day 2
    const report = view(clients[spy]).players[String(spy)].inbox.find((m) => m.text.startsWith('📦'))!.text;
    expect(report).toContain('nothing suspicious');
  });

  it('lets customs find a stash, unless security was hired', () => {
    for (const withSecurity of [false, true]) {
      const { clients, s, ps } = stashMatch();
      allReady(clients); // -> night 1
      if (withSecurity) clients[s].moves.hireSecurity(true);
      const spy = (s + 1) % 4;
      clients[spy].moves.planSpy(ps[s].nation, 'customs');
      allReady(clients); // -> day 2
      const report = view(clients[spy]).players[String(spy)].inbox.find((m) => m.text.startsWith('📦'))!.text;
      if (withSecurity) expect(report).toContain('nothing suspicious');
      else expect(report).toContain('found 6 smuggled cards');
    }
  });

  it("can't sell contraband at the market", () => {
    const { clients, s } = stashMatch();
    const before = view(clients[s]).players[String(s)];
    if (before.hand.silk === 0) {
      clients[s].moves.sell('silk', 1);
      expect(view(clients[s]).players[String(s)].contraband.silk).toBe(2);
      expect(view(clients[s]).players[String(s)].gold).toBe(before.gold);
    }
  });

  // ---------- spy operations ----------

  it('allows two spy operations a night and reports counter-intelligence', () => {
    const { clients } = stashMatch();
    allReady(clients); // -> night 1
    const G = view(clients[0]);
    const mine = G.players['0'].nation;
    const theirs = view(clients[1]).players['1'].nation;
    const third = G.nationOrder.find((n) => n !== mine && n !== theirs)!;
    clients[0].moves.planCounter();
    clients[0].moves.planSpy(theirs, 'treasury');
    clients[0].moves.planSpy(third, 'customs'); // a third operation is refused
    expect(view(clients[0]).players['0'].plans).toHaveLength(SPY.perNight);
    clients[1].moves.planSpy(mine, 'treasury'); // player 1 spies on player 0
    allReady(clients); // -> day 2
    const note = view(clients[0]).players['0'].inbox.find((m) => m.text.startsWith('🔎'))!.text;
    expect(note).toContain(view(clients[0]).nations[theirs]!.name);
    void spendable;
  });
});
