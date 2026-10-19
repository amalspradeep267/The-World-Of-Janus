import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { describe, expect, it } from 'vitest';
import { COST, MAX_ROUNDS, RESOURCES, SETUP_TABLE } from './constants';
import { findRoute, handTotal, makeGame } from './game';
import type { GState, Hand } from './types';

function startMatch(n: number) {
  const game = makeGame(Array.from({ length: n }, (_, i) => `P${i}`));
  const multiplayer = Local();
  const clients = Array.from({ length: n }, (_, i) =>
    Client({ game, numPlayers: n, playerID: String(i), multiplayer, matchID: `m${n}` }),
  );
  clients.forEach((c) => c.start());
  return clients;
}

const view = (c: ReturnType<typeof startMatch>[number]) => c.getState()!.G as GState;

/** Pay `cost` cards from whatever the hand has most of. */
function pay(hand: Hand, cost: number): Partial<Hand> | null {
  const left = { ...hand };
  const paid: Partial<Hand> = {};
  for (let k = 0; k < cost; k++) {
    const r = [...RESOURCES].sort((a, b) => left[b] - left[a])[0];
    if (left[r] === 0) return null;
    left[r]--;
    paid[r] = (paid[r] ?? 0) + 1;
  }
  return paid;
}

describe('The World of Janus', () => {
  it('keeps other players secret in each player view', () => {
    const clients = startMatch(4);
    const G0 = view(clients[0]);
    expect(Object.keys(G0.players)).toEqual(['0']);
    const ownedVisible = Object.values(G0.owners).filter((o) => o !== undefined);
    // Only their own nation is known at the start (4 players: no Pact partner unless they're Pact).
    expect(ownedVisible.length).toBeGreaterThanOrEqual(1);
    expect(G0.nationOrder.length).toBe(SETUP_TABLE[4].nations);
  });

  for (const n of [3, 4, 5, 8]) {
    it(`plays a full ${n}-player game to a result`, () => {
      const clients = startMatch(n);
      for (let guard = 0; guard < 200 && !clients[0].getState()!.ctx.gameover; guard++) {
        const phase = clients[0].getState()!.ctx.phase;
        clients.forEach((c, i) => {
          const G = view(c);
          const p = G.players[String(i)];
          if (phase === 'day') {
            for (const e of G.envoys) if (e.to === p.nation && e.status === 'pending') c.moves.respondEnvoy(e.id, i % 2 === 0);
            const partner = (i + 1) % n;
            const give = pay(p.hand, 1);
            if (give) c.moves.proposeTrade(String(partner), give, { [RESOURCES[i % RESOURCES.length]]: 1 });
            const G2 = view(c);
            for (const t of G2.trades) if (t.to === String(i) && t.status === 'open') c.moves.respondTrade(t.id, true);
            if (G2.round >= 3) c.moves.vote(String((i + 1) % n));
          } else {
            const target = G.nationOrder.find((x) => x !== p.nation && !findRoute(G, p.nation, x));
            const paid = pay(p.hand, COST.envoy);
            if (target && paid) c.moves.planEnvoy(target, paid);
            const rt = G.routes.find((r) => r.a === p.nation || r.b === p.nation);
            if (rt) {
              const other = rt.a === p.nation ? rt.b : rt.a;
              const good = G.nations[p.nation]!.resources.find((g) => !rt.goods.includes(g));
              const paid2 = pay(view(c).players[String(i)].hand, COST.route);
              if (good && paid2) c.moves.planRoute(other, good, paid2);
            }
          }
          c.moves.setReady(true);
        });
      }
      const state = clients[0].getState()!;
      expect(state.ctx.gameover).toBeTruthy();
      const G = state.G as GState;
      expect(G.round).toBeLessThanOrEqual(MAX_ROUNDS);
      expect(G.news.length).toBeGreaterThan(1);
      // Once the game ends everything is revealed.
      expect(Object.keys(G.players).length).toBe(n);
      for (const p of Object.values(G.players)) {
        expect(handTotal(p.hand)).toBeGreaterThanOrEqual(0);
        for (const r of RESOURCES) expect(p.hand[r]).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it('reveals the sender persona only to the receiver who accepts', () => {
    const clients = startMatch(4);
    const done = () => clients.forEach((c) => c.moves.setReady(true));
    done(); // day 1 -> night 1
    const G = view(clients[0]);
    const mine = G.players['0'].nation;
    // Pick a target that player 1 controls by peeking at the host-side truth via player 1's own view.
    const target = view(clients[1]).players['1'].nation;
    clients[0].moves.planEnvoy(target, pay(G.players['0'].hand, COST.envoy)!);
    done(); // night 1 -> day 2
    const envoy = view(clients[1]).envoys.find((e) => e.from === mine && e.to === target)!;
    expect(envoy.status).toBe('pending');
    clients[1].moves.respondEnvoy(envoy.id, true);
    expect(view(clients[1]).owners[mine]).toBe('0');
    if (view(clients[2]).players['2'].faction !== 'pact') expect(view(clients[2]).owners[mine]).toBeUndefined();
  });
});
