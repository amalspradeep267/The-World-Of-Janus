import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { describe, expect, it } from 'vitest';
import { COST, MAX_GOODS_PER_ROUTE, MAX_ROUNDS, MAX_ROUTES_PER_CITY, PUMP, RECIPE, RESOURCES, SETUP_TABLE, TARIFF, type Resource } from './constants';
import { findRoute, handTotal, hasGoods, makeGame, routeCount, smugglePrice } from './game';
import type { GState, Hand } from './types';

function startMatch(n: number, id = `m${n}-${Math.random()}`) {
  const game = makeGame(Array.from({ length: n }, (_, i) => `P${i}`));
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
            if (view(c).round >= 3) c.moves.vote(String((i + 1) % n));
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
    const ore = G.players[String(s)].hand.ore;
    clients[s].moves.planSmuggle('ore');
    expect(view(clients[s]).players[String(s)].gold).toBe(gold - price);
    if (view(clients[s]).players[String(s)].gold >= PUMP.gold) clients[s].moves.planPump('silk');
    allReady(clients); // -> day 2: delivery
    expect(view(clients[s]).players[String(s)].hand.ore).toBeGreaterThanOrEqual(ore + 1);
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
    const report = me.inbox.find((m) => m.text.startsWith('🕵️'))!;
    expect(report.text).toContain(`received ${earned} gold from 1 sale`);
    expect(me.known[target]).toBeUndefined(); // no identity leak
    expect(me.gold).toBeLessThanOrEqual(15 - COST.spyGold);
  });

  it('puts a tariff on an exposed innocent instead of ending the game', () => {
    const clients = startMatch(4);
    const factions = clients.map((c, i) => view(c).players[String(i)].faction);
    const innocent = factions.findIndex((f) => f !== 'syndicate');
    for (let k = 0; k < 4; k++) allReady(clients); // reach day 3, when the Tribunal opens
    expect(view(clients[0]).round).toBe(3);
    clients.forEach((c, i) => i !== innocent && c.moves.vote(String(innocent)));
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
});
