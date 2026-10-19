import { useEffect, useState } from 'react';
import { COST, FACTION_INFO, RESOURCE_INFO, type NationId, type Resource } from '../game/constants';
import { findRoute } from '../game/game';
import type { GState, Hand, PlayerSecret } from '../game/types';
import { autoPay, Avatar, goodsEmoji, personaOf, ResPill } from './common';

interface Props {
  G: GState;
  phase: 'day' | 'night';
  me: PlayerSecret;
  playerID: string;
  nation: NationId;
  moves: Record<string, (...args: any[]) => void>;
  onClose: () => void;
}

type Mode = null | 'trade' | 'spy';

export function NationSheet({ G, phase, me, playerID, nation, moves, onClose }: Props) {
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
  const envoyPay = autoPay(me.hand, COST.envoy);
  const routePay = autoPay(me.hand, COST.route);
  const tradeable = route
    ? [...new Set([...G.nations[me.nation]!.resources, ...n.resources])].filter(
        (g) => !route.goods.includes(g) && !me.plans.some((p) => p.kind === 'route' && p.with === nation && p.good === g),
      )
    : [];

  const ruler = mine ? (
    <span className="muted small">Your city</span>
  ) : owner === undefined ? (
    <span className="muted small">Ruler: ❓ unknown</span>
  ) : owner === 'bot' ? (
    <span className="muted small">Ruler: nobody (bot)</span>
  ) : (
    <span className="row small">
      <Avatar persona={personaOf(G, owner).persona} size={20} /> {personaOf(G, owner).persona}
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
      {route && (
        <p className="small" style={{ marginTop: 10 }}>
          🤝 Connected with you{route.goods.length > 0 && <> · trading {route.goods.map((g) => RESOURCE_INFO[g].emoji).join(' ')}</>}
        </p>
      )}
      {pending && <p className="small" style={{ marginTop: 10 }}>✉️ An envoy is waiting for an answer</p>}

      {mine ? (
        <p className="small muted" style={{ marginTop: 12 }}>
          You serve the <b>{FACTION_INFO[me.faction].label}</b>. Nobody else knows this city is yours.
        </p>
      ) : phase === 'day' ? (
        <p className="small muted" style={{ marginTop: 12 }}>🌙 You can act on this city at night.</p>
      ) : (
        <>
          {!route && !pending && (
            <button
              className="action"
              disabled={!envoyPay || plannedEnvoy}
              onClick={() => moves.planEnvoy(nation, envoyPay)}
            >
              <span className="ai">✉️</span>
              <span>
                <b>{plannedEnvoy ? 'Envoy ordered ✓' : 'Send an envoy'}</b>
                <span>{envoyPay || plannedEnvoy ? "If they accept, you're connected and they learn who you are." : `Needs ${COST.envoy} cards.`}</span>
              </span>
              {!plannedEnvoy && <span className="cost">{envoyPay ? goodsEmoji(envoyPay) : `${COST.envoy} cards`}</span>}
            </button>
          )}

          {route && (
            <button className={`action ${mode === 'trade' ? 'chosen' : ''}`} disabled={!routePay || tradeable.length === 0} onClick={() => setMode(mode === 'trade' ? null : 'trade')}>
              <span className="ai">🤝</span>
              <span>
                <b>Open a trade route</b>
                <span>Both of you get a share whenever either harvests that good.</span>
              </span>
              <span className="cost">{routePay ? goodsEmoji(routePay) : `${COST.route} cards`}</span>
            </button>
          )}
          {mode === 'trade' && (
            <div className="row" style={{ marginTop: 8 }}>
              {tradeable.map((g: Resource) => (
                <button
                  key={g}
                  onClick={() => {
                    moves.planRoute(nation, g, routePay as Partial<Hand>);
                    setMode(null);
                  }}
                >
                  {RESOURCE_INFO[g].emoji} {RESOURCE_INFO[g].label}
                </button>
              ))}
            </div>
          )}

          <button className={`action ${mode === 'spy' ? 'chosen' : ''}`} disabled={me.gold < COST.spyGold} onClick={() => setMode(mode === 'spy' ? null : 'spy')}>
            <span className="ai">🕵️</span>
            <span>
              <b>Send spies</b>
              <span>{me.gold < COST.spyGold ? `Needs ${COST.spyGold} gold. Sell cards at the 💰 market by day.` : 'Ask: is this city ruled by…?'}</span>
            </span>
            <span className="cost">{'🪙'.repeat(COST.spyGold)}</span>
          </button>
          {mode === 'spy' && (
            <div className="pick-grid" style={{ marginTop: 8 }}>
              {G.roster
                .filter((p) => p.id !== playerID)
                .map((p) => (
                  <div
                    key={p.id}
                    className="pickable"
                    onClick={() => {
                      moves.planSpy(nation, p.id);
                      setMode(null);
                    }}
                  >
                    <Avatar persona={p.persona} />
                    <small>{p.persona}</small>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
