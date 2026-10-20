import { useEffect, useState } from 'react';
import {
  COST,
  FACTION_INFO,
  MAX_GOODS_PER_ROUTE,
  MAX_ROUTES_PER_CITY,
  RECIPE,
  RESOURCE_INFO,
  type NationId,
  type Resource,
} from '../game/constants';
import { findRoute, routeCount } from '../game/game';
import type { GState, PlayerSecret } from '../game/types';
import { Avatar, playerOf, Recipe, ResPill, missingFor } from './common';

interface Props {
  G: GState;
  phase: 'day' | 'night';
  me: PlayerSecret;
  playerID: string;
  nation: NationId;
  moves: Record<string, (...args: any[]) => void>;
  onClose: () => void;
}

type Mode = null | 'trade';

export function NationSheet({ G, phase, me, nation, moves, onClose }: Props) {
  const [mode, setMode] = useState<Mode>(null);
  useEffect(() => setMode(null), [nation, phase]);

  const n = G.nations[nation]!;
  const mine = nation === me.nation;
  const owner = G.owners[nation];
  const route = findRoute(G, me.nation, nation);
  const pending = G.envoys.some(
    (e) => e.status === 'pending' && ((e.from === me.nation && e.to === nation) || (e.from === nation && e.to === me.nation)),
  );
  const plannedEnvoy = me.plans.some((p) => p.kind === 'envoy' && p.to === nation);
  const plannedEnvoys = me.plans.filter((p) => p.kind === 'envoy').length;
  const atRouteCap = routeCount(G, me.nation) + plannedEnvoys >= MAX_ROUTES_PER_CITY;
  const canSmuggle = me.faction === 'syndicate';
  const envoyMissing = missingFor(me.hand, RECIPE.envoy);
  const routeMissing = missingFor(me.hand, RECIPE.route);
  const plannedGoods = me.plans.filter((p) => p.kind === 'route' && p.with === nation).length;
  const goodsFull = route ? route.goods.length + plannedGoods >= MAX_GOODS_PER_ROUTE : false;
  const tradeable = route
    ? [...new Set([...G.nations[me.nation]!.resources, ...n.resources])].filter(
        (g) => !route.goods.includes(g) && !me.plans.some((p) => p.kind === 'route' && p.with === nation && p.good === g),
      )
    : [];

  const envoyBlock = plannedEnvoy
    ? 'Envoy ordered ✓'
    : atRouteCap
      ? `You already have ${MAX_ROUTES_PER_CITY} connections (the maximum).`
      : envoyMissing.length
        ? `Missing ${envoyMissing.map((r) => RESOURCE_INFO[r].emoji).join(' ')}: trade for it by day${canSmuggle ? ' or 🕶️ smuggle it' : ''}.`
        : null;
  const routeBlock = goodsFull
    ? `This connection already carries ${MAX_GOODS_PER_ROUTE} goods (the maximum).`
    : routeMissing.length
      ? `Missing ${routeMissing.map((r) => RESOURCE_INFO[r].emoji).join(' ')}: trade for it by day${canSmuggle ? ' or 🕶️ smuggle it' : ''}.`
      : tradeable.length === 0
        ? 'Every good between you is already traded.'
        : null;

  const ruler = mine ? (
    <span className="muted small">Your city</span>
  ) : owner === undefined ? (
    <span className="muted small">Ruler: ❓ unknown</span>
  ) : owner === 'bot' ? (
    <span className="muted small">Ruler: nobody (bot)</span>
  ) : (
    <span className="row small">
      <Avatar name={playerOf(G, owner).name} size={20} /> {playerOf(G, owner).name}
    </span>
  );

  return (
    <div className="sheet" onClick={(e) => e.stopPropagation()}>
      <button className="close ghost tiny" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <div className="sheet-head">
        <div className="big-icon">{n.icon}</div>
        <div>
          <h2>{n.name}</h2>
          {ruler}
        </div>
      </div>
      <div className="produces">
        {n.resources.map((r) => (
          <ResPill key={r} res={r} />
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        🔗 {routeCount(G, nation)}/{MAX_ROUTES_PER_CITY} connections
      </p>
      {route && (
        <p className="small">
          🤝 Connected with you{route.goods.length > 0 && <> · trading {route.goods.map((g) => RESOURCE_INFO[g].emoji).join(' ')}</>}
        </p>
      )}
      {pending && <p className="small">✉️ An envoy is waiting for an answer</p>}

      {mine ? (
        <p className="small muted" style={{ marginTop: 12 }}>
          Your faction: <b>{FACTION_INFO[me.faction].label}</b>. Nobody else knows this city is yours.
        </p>
      ) : phase === 'day' ? (
        <p className="small muted" style={{ marginTop: 12 }}>🌙 You can act on this city at night.</p>
      ) : (
        <>
          {!route && !pending && (
            <button className="action" disabled={!!envoyBlock} onClick={() => moves.planEnvoy(nation)}>
              <span className="ai">✉️</span>
              <span>
                <b>{plannedEnvoy ? 'Envoy ordered ✓' : 'Send an envoy'}</b>
                <span>{envoyBlock && !plannedEnvoy ? envoyBlock : "If they accept, you're connected and they learn who you are."}</span>
              </span>
              {!plannedEnvoy && <Recipe recipe={RECIPE.envoy} hand={me.hand} />}
            </button>
          )}

          {route && (
            <button className={`action ${mode === 'trade' ? 'chosen' : ''}`} disabled={!!routeBlock} onClick={() => setMode(mode === 'trade' ? null : 'trade')}>
              <span className="ai">🤝</span>
              <span>
                <b>Open a trade route</b>
                <span>{routeBlock ?? 'Pick a good. Whenever one of you harvests it, the other gets 1 too.'}</span>
              </span>
              <Recipe recipe={RECIPE.route} hand={me.hand} />
            </button>
          )}
          {mode === 'trade' && (
            <div className="row" style={{ marginTop: 8 }}>
              {tradeable.map((g: Resource) => (
                <button
                  key={g}
                  onClick={() => {
                    moves.planRoute(nation, g);
                    setMode(null);
                  }}
                >
                  {RESOURCE_INFO[g].emoji} {RESOURCE_INFO[g].label}
                </button>
              ))}
            </div>
          )}

          <button
            className="action"
            disabled={me.gold < COST.spyGold || me.plans.some((p) => p.kind === 'spy' && p.nation === nation)}
            onClick={() => moves.planSpy(nation)}
          >
            <span className="ai">🕵️</span>
            <span>
              <b>{me.plans.some((p) => p.kind === 'spy' && p.nation === nation) ? 'Spies sent ✓' : 'Spy on its treasury'}</b>
              <span>
                {me.gold < COST.spyGold
                  ? `Needs ${COST.spyGold} gold. Sell cards at the 💰 market by day.`
                  : 'Learn how much gold this city earned from sales and spent this round. Match it to the public sales.'}
              </span>
            </span>
            <span className="cost">🪙{COST.spyGold}</span>
          </button>
        </>
      )}
    </div>
  );
}
