import { useEffect, useState } from 'react';
import {
  SPY,
  FACTORY,
  FACTION_INFO,
  KIDNAP,
  MAX_GOODS_PER_ROUTE,
  MAX_ROUTES_PER_CITY,
  RECIPE,
  RESOURCE_INFO,
  type NationId,
  type Resource,
} from '../game/constants';
import { canBuildFactory, cityDistance, distanceGold, factoryCost, findRoute, hasGoods, routeCount, spendable, spyOpsUsed } from '../game/game';
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

type Mode = null | 'trade' | 'kidnap' | 'factory';

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
  const plannedEnvoys = me.plans.filter((p) => p.kind === 'envoy').length;
  const atRouteCap = routeCount(G, me.nation) + plannedEnvoys >= MAX_ROUTES_PER_CITY;
  const canSmuggle = me.faction === 'syndicate';
  // Night recipes can be paid from the hand and (Syndicate) the contraband stash.
  const cards = spendable(me);
  const kidnapPlanned = me.plans.find((p) => p.kind === 'kidnap');
  const opsLeft = SPY.perNight - spyOpsUsed(me);
  const counterPlanned = me.plans.some((p) => p.kind === 'counter');
  // Syndicate members know each other's cities; they can't kidnap their own.
  const teammates = Object.values(me.known).filter((who): who is string => who !== 'bot' && who !== playerID);
  const hexes = cityDistance(G, me.nation, nation);
  const travel = distanceGold(G, me.nation, nation);
  const shortOfGold = me.gold < travel;
  const envoyMissing = missingFor(cards, RECIPE.envoy);
  const routeMissing = missingFor(cards, RECIPE.route);
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
        : shortOfGold
          ? `It's far away: you need ${travel} gold for the journey.`
          : null;
  const factoryTiles = mine ? n.tiles.filter((t) => canBuildFactory(G, me, t)) : [];
  const affordableTiles = factoryTiles.filter((t) => hasGoods(cards, factoryCost(G, t)));
  const factoryMissing = missingFor(cards, RECIPE.factory);
  const factoryBlock =
    factoryTiles.length === 0
      ? FACTORY.tiles
        ? `Factories only go on ${FACTORY.tiles.map((r) => RESOURCE_INFO[r].emoji).join(' ')} tiles, one each, and you have no free one.`
        : 'Every one of your tiles already has a factory.'
      : affordableTiles.length === 0 && !factoryMissing.length && FACTORY.tileCost > 0
        ? `You need ${FACTORY.tileCost} of a tile's own resource as well. Save up, or trade for more.`
        : factoryMissing.length
        ? `Missing ${factoryMissing.map((r) => RESOURCE_INFO[r].emoji).join(' ')}: trade for it by day${canSmuggle ? ' or 🕶️ smuggle it' : ''}.`
        : null;
  const routeBlock = goodsFull
    ? `This connection already carries ${MAX_GOODS_PER_ROUTE} goods (the maximum).`
    : routeMissing.length
      ? `Missing ${routeMissing.map((r) => RESOURCE_INFO[r].emoji).join(' ')}: trade for it by day${canSmuggle ? ' or 🕶️ smuggle it' : ''}.`
      : tradeable.length === 0
        ? 'Every good between you is already traded.'
        : shortOfGold
          ? `It's far away: you need ${travel} gold to run a supply line there.`
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
        {!mine && (
          <>
            {' · '}📏 {hexes} hexes away{travel > 0 ? ` · envoys & supply lines cost +🪙${travel}` : ' · no travel cost'}
          </>
        )}
      </p>
      {route && (
        <p className="small">
          🤝 Connected with you{route.goods.length > 0 && <> · supply lines: {route.goods.map((g) => RESOURCE_INFO[g].emoji).join(' ')}</>}
        </p>
      )}
      {pending && <p className="small">✉️ An envoy is waiting for an answer</p>}
      {n.factories.length > 0 && (
        <p className="small">
          🏭 Factories: {n.factories.map((f) => RESOURCE_INFO[f.good].emoji).join(' ')}{' '}
          <span className="muted">(+{FACTORY.yield} each time their tile is rolled)</span>
        </p>
      )}

      {mine ? (
        <>
          <p className="small muted" style={{ marginTop: 12 }}>
            Your faction: <b>{FACTION_INFO[me.faction].label}</b>. Nobody else knows this city is yours.
          </p>
          {phase === 'day' ? (
            <p className="small muted">🌙 At night you can build 🏭 factories here.</p>
          ) : (
            <>
              <button className={`action ${mode === 'factory' ? 'chosen' : ''}`} disabled={!!factoryBlock} onClick={() => setMode(mode === 'factory' ? null : 'factory')}>
                <span className="ai">🏭</span>
                <span>
                  <b>Build a factory</b>
                  <span>
                    {factoryBlock ??
                      `Pick one of your tiles: each time its number is rolled it makes ${FACTORY.yield} more. Everyone will see it on the map.`}
                  </span>
                </span>
                <span className="cost">
                  {FACTORY.tileCost > 0 && <>{FACTORY.tileCost}× tile + </>}
                  <Recipe recipe={RECIPE.factory} hand={cards} />
                </span>
              </button>
              <button
                className="action"
                disabled={counterPlanned || opsLeft === 0 || me.gold < SPY.counter}
                onClick={() => moves.planCounter()}
              >
                <span className="ai">🔎</span>
                <span>
                  <b>{counterPlanned ? 'Counter-intelligence ordered ✓' : 'Counter-intelligence'}</b>
                  <span>
                    {!counterPlanned && opsLeft === 0
                      ? `You've used your ${SPY.perNight} spy operations tonight.`
                      : !counterPlanned && me.gold < SPY.counter
                        ? `Needs ${SPY.counter} gold.`
                        : 'Find out which cities send spies to your city tonight.'}
                  </span>
                </span>
                <span className="cost">🪙{SPY.counter}</span>
              </button>
              {mode === 'factory' && (
                <div className="stack" style={{ marginTop: 8 }}>
                  {factoryTiles.map((t) => {
                    const r = G.tiles[t].resource!;
                    const cost = factoryCost(G, t);
                    return (
                      <button
                        key={t}
                        className="row"
                        disabled={!hasGoods(cards, cost)}
                        title={hasGoods(cards, cost) ? undefined : `You have ${cards[r]} ${RESOURCE_INFO[r].label}`}
                        onClick={() => {
                          moves.planFactory(t);
                          setMode(null);
                        }}
                      >
                        {RESOURCE_INFO[r].emoji} {RESOURCE_INFO[r].label} tile ({G.tiles[t].number}) · <Recipe recipe={cost} hand={cards} />
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
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
              {!plannedEnvoy && (
                <span className="cost">
                  <Recipe recipe={RECIPE.envoy} hand={cards} />
                  {travel > 0 && <span className={shortOfGold ? 'lacking' : ''}>🪙{travel}</span>}
                </span>
              )}
            </button>
          )}

          {route && (
            <button className={`action ${mode === 'trade' ? 'chosen' : ''}`} disabled={!!routeBlock} onClick={() => setMode(mode === 'trade' ? null : 'trade')}>
              <span className="ai">🤝</span>
              <span>
                <b>Open a supply line</b>
                <span>{routeBlock ?? 'Pick a good. Whenever one of you produces it, the other gets 1 too.'}</span>
              </span>
              <span className="cost">
                <Recipe recipe={RECIPE.route} hand={cards} />
                {travel > 0 && <span className={shortOfGold ? 'lacking' : ''}>🪙{travel}</span>}
              </span>
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

          <p className="small muted" style={{ margin: '12px 0 0' }}>
            🕵️ Spy operations tonight: {SPY.perNight - opsLeft} of {SPY.perNight} used
          </p>
          {(['treasury', 'customs'] as const).map((op) => {
            const ordered = me.plans.some((p) => p.kind === 'spy' && p.nation === nation && p.op === op);
            const cost = SPY[op];
            const reason = ordered
              ? null
              : opsLeft === 0
                ? `You've used your ${SPY.perNight} spy operations tonight.`
                : me.gold < cost
                  ? `Needs ${cost} gold. Sell cards at the 💰 market by day.`
                  : null;
            return (
              <button key={op} className="action" disabled={ordered || !!reason} onClick={() => moves.planSpy(nation, op)}>
                <span className="ai">{op === 'treasury' ? '💰' : '📦'}</span>
                <span>
                  <b>
                    {op === 'treasury' ? 'Treasury audit' : 'Customs inspection'}
                    {ordered ? ' ✓' : ''}
                  </b>
                  <span>
                    {reason ??
                      (op === 'treasury'
                        ? 'How much gold this city received and spent this round. Compare it with the public sales.'
                        : 'Whether this city is holding smuggled goods.')}
                  </span>
                </span>
                <span className="cost">🪙{cost}</span>
              </button>
            );
          })}

          {me.faction === 'syndicate' && (
            <>
              <button
                className={`action ${mode === 'kidnap' ? 'chosen' : ''}`}
                disabled={!!kidnapPlanned || me.gold < KIDNAP.gold}
                onClick={() => setMode(mode === 'kidnap' ? null : 'kidnap')}
              >
                <span className="ai">🗡️</span>
                <span>
                  <b>{kidnapPlanned ? 'Kidnappers sent tonight ✓' : 'Kidnap a citizen'}</b>
                  <span>
                    {me.gold < KIDNAP.gold && !kidnapPlanned
                      ? `Needs ${KIDNAP.gold} gold.`
                      : `Name the player who rules this city. Right: they pay you 🪙${KIDNAP.ransom} every dawn to keep the citizen safe. Wrong: you're exposed in the newspaper.`}
                  </span>
                </span>
                <span className="cost">🪙{KIDNAP.gold}</span>
              </button>
              {mode === 'kidnap' && (
                <div className="stack" style={{ marginTop: 8 }}>
                  <span className="small" style={{ color: 'var(--bad)' }}>⚠️ Who rules {n.name}? A wrong guess exposes you to everyone.</span>
                  <div className="pick-grid">
                    {G.roster
                      .filter((p) => p.id !== playerID && !teammates.includes(p.id) && !G.revealed[p.id])
                      .map((p) => (
                        <div
                          key={p.id}
                          className="pickable"
                          onClick={() => {
                            moves.planKidnap(nation, p.id);
                            setMode(null);
                          }}
                        >
                          <Avatar name={p.name} />
                          <small>{p.name}</small>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
