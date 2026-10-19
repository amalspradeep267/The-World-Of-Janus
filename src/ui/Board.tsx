import { useEffect, useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import {
  COST,
  FACTION_INFO,
  MAX_ROUNDS,
  RESOURCES,
  RESOURCE_INFO,
  TRIBUNAL_FROM_ROUND,
  type NationId,
  type Resource,
} from '../game/constants';
import { findRoute, formatGoods, handTotal, icon } from '../game/game';
import type { GState, Hand, PlayerSecret } from '../game/types';
import { HexMap } from './HexMap';
import { clean, GoodsPicker, HandView } from './widgets';

type Tab = 'actions' | 'dossier' | 'news' | 'table';

export function Board(props: BoardProps<GState>) {
  const { G, ctx, playerID, isConnected } = props;
  const [selected, setSelected] = useState<NationId | null>(null);
  const [tab, setTab] = useState<Tab>('actions');
  const [seenNews, setSeenNews] = useState(0);
  const me = playerID != null ? G.players[playerID] : undefined;

  useEffect(() => {
    if (tab === 'news') setSeenNews(G.news.length);
  }, [tab, G.news.length]);

  if (!me) return <div className="home"><p>Spectating isn't supported yet.</p></div>;

  const phase = ctx.phase as 'day' | 'night';
  const ready = !!G.ready[playerID!];

  return (
    <div className="board">
      <header className="topbar">
        <span className={`phase ${phase}`}>
          {phase === 'day' ? '☀️ Day: Diplomacy' : '🌙 Night: Under the Table'}
        </span>
        <span className="muted">
          Round {G.round} / {MAX_ROUNDS}
        </span>
        {G.rolls.length > 0 && <span title="This morning's harvest rolls">🎲 {G.rolls.join(' · ')}</span>}
        {!isConnected && <span className="chip" style={{ color: 'var(--bad)' }}>Reconnecting…</span>}
        <span className="spacer" />
        <span className="row">
          {G.roster.map((p) => (
            <span key={p.id} className={`chip ${G.ready[p.id] ? 'on' : ''}`} title={p.name}>
              {G.ready[p.id] ? '✓' : '…'} {p.persona}
            </span>
          ))}
        </span>
        <button className={ready ? '' : 'primary'} onClick={() => props.moves.setReady(!ready)}>
          {ready ? 'Wait, not ready' : phase === 'day' ? 'Ready for night' : 'Ready for morning'}
        </button>
      </header>

      <div className="main">
        <div className="map-wrap">
          <HexMap G={G} myNation={me.nation} selected={selected} onSelect={setSelected} />
        </div>
        <aside className="side">
          <nav className="tabs">
            {(['actions', 'dossier', 'news', 'table'] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {{ actions: 'Actions', dossier: 'Dossier', news: 'News', table: 'Table' }[t]}
                {t === 'news' && G.news.length > seenNews && <span className="dot" />}
              </button>
            ))}
          </nav>
          <div className="side-body">
            {tab === 'actions' && <Actions {...props} me={me} selected={selected} setSelected={setSelected} />}
            {tab === 'dossier' && <Dossier G={G} me={me} />}
            {tab === 'news' && <News G={G} />}
            {tab === 'table' && <TableView G={G} />}
          </div>
        </aside>
      </div>

      {G.result && <Result G={G} playerID={playerID!} />}
    </div>
  );
}

// ---------- Actions ----------

interface ActionsProps extends BoardProps<GState> {
  me: PlayerSecret;
  selected: NationId | null;
  setSelected: (n: NationId | null) => void;
}

function Actions(props: ActionsProps) {
  const { G, ctx, me, moves } = props;
  const incoming = G.envoys.filter((e) => e.to === me.nation && e.status === 'pending');
  return (
    <div className="stack">
      {incoming.length > 0 && (
        <section>
          <h3>Envoys at your gate</h3>
          {incoming.map((e) => (
            <div key={e.id} className="item secret">
              <p>
                {icon(G, e.from)} seeks a connection. Accepting reveals the sender's persona to you alone.
              </p>
              <div className="row">
                <button className="good" onClick={() => moves.respondEnvoy(e.id, true)}>Accept</button>
                <button className="bad" onClick={() => moves.respondEnvoy(e.id, false)}>Turn away</button>
              </div>
            </div>
          ))}
        </section>
      )}
      {ctx.phase === 'day' ? <DayActions {...props} /> : <NightActions {...props} />}
    </div>
  );
}

function DayActions({ G, me, moves, playerID }: ActionsProps) {
  const others = G.roster.filter((p) => p.id !== playerID);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [give, setGive] = useState<Partial<Hand>>({});
  const [get, setGet] = useState<Partial<Hand>>({});
  const [sellPick, setSellRes] = useState<Resource>('grain');
  const sellRes = me.hand[sellPick] > 0 ? sellPick : (RESOURCES.find((r) => me.hand[r] > 0) ?? sellPick);
  const [sellQty, setSellQty] = useState(1);
  const persona = (id: string) => G.roster.find((p) => p.id === id)!.persona;
  const myVote = G.votes[playerID!];

  return (
    <>
      <p className="muted small">
        Talk it out on Discord. Everything you do by day is public and signed with your persona.
      </p>

      <section>
        <h3>Trade offers</h3>
        {G.trades.filter((t) => t.status === 'open').length === 0 && <p className="muted small">No open offers.</p>}
        {G.trades
          .filter((t) => t.status === 'open')
          .map((t) => (
            <div key={t.id} className="item">
              <p>
                <b>{persona(t.from)}</b> → <b>{persona(t.to)}</b>: gives {formatGoods(t.give)} for {formatGoods(t.get)}
              </p>
              {t.to === playerID && (
                <div className="row">
                  <button className="good" onClick={() => moves.respondTrade(t.id, true)}>Accept</button>
                  <button className="bad" onClick={() => moves.respondTrade(t.id, false)}>Decline</button>
                </div>
              )}
              {t.from === playerID && <button className="tiny" onClick={() => moves.cancelTrade(t.id)}>Cancel</button>}
            </div>
          ))}
        <div className="item stack">
          <div className="row">
            <span>Offer to</span>
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.persona} ({p.name})
                </option>
              ))}
            </select>
          </div>
          <span className="small muted">You give</span>
          <GoodsPicker value={give} onChange={setGive} max={me.hand} />
          <span className="small muted">You ask for</span>
          <GoodsPicker value={get} onChange={setGet} />
          <button
            disabled={handTotal(give) === 0 || handTotal(get) === 0}
            onClick={() => {
              moves.proposeTrade(to, clean(give), clean(get));
              setGive({});
              setGet({});
            }}
          >
            Propose trade
          </button>
        </div>
      </section>

      <section>
        <h3>Market</h3>
        <div className="row small">
          {RESOURCES.map((r) => (
            <span key={r} className="chip">
              {RESOURCE_INFO[r].emoji} {G.prices[r]}g
              {G.priceChange[r] ? (G.priceChange[r]! > 0 ? ' ▲' : ' ▼') : ''}
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span>Sell</span>
          <input type="number" min={1} max={me.hand[sellRes]} value={sellQty} onChange={(e) => setSellQty(Number(e.target.value))} style={{ width: 60 }} />
          <select value={sellRes} onChange={(e) => setSellRes(e.target.value as Resource)}>
            {RESOURCES.filter((r) => me.hand[r] > 0).map((r) => (
              <option key={r} value={r}>
                {RESOURCE_INFO[r].emoji} {RESOURCE_INFO[r].label} ({me.hand[r]})
              </option>
            ))}
          </select>
          <button disabled={!(sellQty >= 1 && me.hand[sellRes] >= sellQty)} onClick={() => moves.sell(sellRes, sellQty)}>
            for {Math.floor(G.prices[sellRes] * sellQty)}g
          </button>
        </div>
        <p className="small muted">Sales are public. Selling pushes the price down.</p>
      </section>

      <section>
        <h3>⚖️ Tribunal</h3>
        {G.round < TRIBUNAL_FROM_ROUND ? (
          <p className="muted small">The Tribunal opens in round {TRIBUNAL_FROM_ROUND}.</p>
        ) : (
          <>
            <p className="small muted">
              A majority ({Math.floor(G.roster.length / 2) + 1} votes) exposes a player's nation and faction at dusk.
              Exposing an innocent hands the Iron Pact the win.
            </p>
            {others
              .filter((p) => !G.revealed[p.id])
              .map((p) => {
                const count = Object.values(G.votes).filter((v) => v === p.id).length;
                return (
                  <div key={p.id} className="row" style={{ marginBottom: 4 }}>
                    <button className={myVote === p.id ? 'primary' : ''} onClick={() => moves.vote(myVote === p.id ? null : p.id)}>
                      {myVote === p.id ? '✓ ' : ''}Accuse {p.persona}
                    </button>
                    <span className="small muted">{count > 0 ? `${count} vote${count > 1 ? 's' : ''}` : ''}</span>
                  </div>
                );
              })}
          </>
        )}
      </section>
    </>
  );
}

function NightActions({ G, me, moves, playerID, selected, setSelected }: ActionsProps) {
  const [paid, setPaid] = useState<Partial<Hand>>({});
  const [good, setGood] = useState<Resource | ''>('');
  const [suspect, setSuspect] = useState('');
  useEffect(() => {
    setPaid({});
    setGood('');
    setSuspect('');
  }, [selected]);

  const targets = G.nationOrder.filter((n) => n !== me.nation);
  const route = selected ? findRoute(G, me.nation, selected) : undefined;
  const pending = selected
    ? G.envoys.some(
        (e) =>
          e.status === 'pending' &&
          ((e.from === me.nation && e.to === selected) || (e.from === selected && e.to === me.nation)),
      )
    : false;
  const tradeable = route
    ? [...new Set([...G.nations[me.nation]!.resources, ...G.nations[selected!]!.resources])].filter((g) => !route.goods.includes(g))
    : [];
  const describe = (plan: PlayerSecret['plans'][number]) =>
    plan.kind === 'envoy'
      ? `✉️ Envoy to ${icon(G, plan.to)} (paid ${formatGoods(plan.paid)})`
      : plan.kind === 'route'
        ? `🤝 Open ${RESOURCE_INFO[plan.good].label} trade with ${icon(G, plan.with)} (paid ${formatGoods(plan.paid)})`
        : `🕵️ Spy: is ${icon(G, plan.nation)} ruled by ${G.roster.find((p) => p.id === plan.suspect)!.persona}? (${plan.gold}g)`;

  return (
    <>
      <p className="muted small">
        Night actions are secret. The morning news reports them by nation icon, never by player.
      </p>

      {me.plans.length > 0 && (
        <section>
          <h3>Tonight's orders</h3>
          {me.plans.map((p, i) => (
            <div key={i} className="item row" style={{ justifyContent: 'space-between' }}>
              <span>{describe(p)}</span>
              <button className="tiny" onClick={() => moves.cancelPlan(i)}>Undo</button>
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>Choose a nation</h3>
        <div className="row">
          {targets.map((n) => (
            <button key={n} className={selected === n ? 'primary' : ''} onClick={() => setSelected(n)}>
              {G.nations[n]!.icon}
            </button>
          ))}
        </div>
        {!selected || selected === me.nation ? (
          <p className="small muted" style={{ marginTop: 8 }}>Pick a nation here or on the map.</p>
        ) : (
          <div className="item stack" style={{ marginTop: 8 }}>
            <b>
              {icon(G, selected)}: produces {G.nations[selected]!.resources.map((r) => RESOURCE_INFO[r].emoji).join(' ')}
            </b>
            {!route && !pending && (
              <>
                <span className="small">
                  Send an envoy: pay any {COST.envoy} resources. If they accept, they learn who you are.
                </span>
                <GoodsPicker value={paid} onChange={setPaid} max={me.hand} total={COST.envoy} />
                <button
                  disabled={handTotal(paid) !== COST.envoy || me.plans.some((p) => p.kind === 'envoy' && p.to === selected)}
                  onClick={() => {
                    moves.planEnvoy(selected, clean(paid));
                    setPaid({});
                  }}
                >
                  ✉️ Send envoy
                </button>
              </>
            )}
            {pending && <span className="small muted">An envoy between you is already waiting for an answer.</span>}
            {route && (
              <>
                <span className="small">
                  Connected{route.goods.length ? `, trading ${route.goods.map((g) => RESOURCE_INFO[g].emoji).join('')}` : ''}. Open trade in a
                  good: pay any {COST.route} resources. Whenever one of you harvests it, the other gets 1 too.
                </span>
                {tradeable.length === 0 ? (
                  <span className="small muted">Every good between you is already traded.</span>
                ) : (
                  <>
                    <select value={good} onChange={(e) => setGood(e.target.value as Resource)}>
                      <option value="">Choose a good…</option>
                      {tradeable.map((g) => (
                        <option key={g} value={g}>
                          {RESOURCE_INFO[g].emoji} {RESOURCE_INFO[g].label}
                        </option>
                      ))}
                    </select>
                    <GoodsPicker value={paid} onChange={setPaid} max={me.hand} total={COST.route} />
                    <button
                      disabled={!good || handTotal(paid) !== COST.route}
                      onClick={() => {
                        moves.planRoute(selected, good, clean(paid));
                        setPaid({});
                        setGood('');
                      }}
                    >
                      🤝 Open trade
                    </button>
                  </>
                )}
              </>
            )}
            <hr style={{ borderColor: 'var(--line)', width: '100%' }} />
            <span className="small">
              Spy ({COST.spyGold} gold, you have {me.gold}): ask whether a player rules {G.nations[selected]!.icon}.
            </span>
            <div className="row">
              <select value={suspect} onChange={(e) => setSuspect(e.target.value)}>
                <option value="">Suspect…</option>
                {G.roster
                  .filter((p) => p.id !== playerID)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.persona}
                    </option>
                  ))}
              </select>
              <button disabled={!suspect || me.gold < COST.spyGold} onClick={() => moves.planSpy(selected, suspect)}>
                🕵️ Send spies
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3>Your hand</h3>
        <HandView hand={me.hand} />
      </section>
    </>
  );
}

// ---------- Dossier / News / Table ----------

function Dossier({ G, me }: { G: GState; me: PlayerSecret }) {
  const known = Object.entries(me.known).filter(([n]) => n !== me.nation) as [NationId, string][];
  return (
    <div className="stack">
      <div className="card identity">
        <h2>
          {icon(G, me.nation)} · {FACTION_INFO[me.faction].label}
        </h2>
        <p className="small">{FACTION_INFO[me.faction].goal}</p>
        <p className="small muted">Keep this screen to yourself.</p>
      </div>
      <section>
        <h3>Treasury: {me.gold} gold</h3>
        <HandView hand={me.hand} />
      </section>
      <section>
        <h3>What you know</h3>
        {known.length === 0 && <p className="muted small">Nothing yet. Accept envoys or send spies to learn who rules what.</p>}
        {known.map(([n, who]) => (
          <div key={n} className="item small">
            {icon(G, n)}: {who === 'bot' ? 'no player' : G.roster.find((p) => p.id === who)!.persona}
          </div>
        ))}
      </section>
      <section>
        <h3>Private dispatches</h3>
        {[...me.inbox].reverse().map((m, i) => (
          <div key={i} className="item secret small">
            <span className="muted">R{m.round} · </span>
            {m.text}
          </div>
        ))}
      </section>
    </div>
  );
}

function News({ G }: { G: GState }) {
  const rounds = [...new Set([...G.news.map((n) => n.round), ...G.publicLog.map((l) => l.round)])].sort((a, b) => b - a);
  return (
    <div>
      {rounds.map((r) => {
        const morning = G.news.find((n) => n.round === r);
        const day = G.publicLog.filter((l) => l.round === r);
        return (
          <div key={r} className="news-round">
            {day.length > 0 && (
              <>
                <h3>Round {r}: by day</h3>
                <ul>{day.map((l, i) => <li key={i}>{l.text}</li>)}</ul>
              </>
            )}
            {morning && (
              <>
                <h3>{r === 0 ? 'Prologue' : `📰 Morning news after night ${r}`}</h3>
                <ul>{morning.items.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TableView({ G }: { G: GState }) {
  return (
    <div className="stack">
      <p className="small muted">The surface layer: everyone knows who's at the table. Nobody knows who rules what.</p>
      {G.roster.map((p) => {
        const rev = G.revealed[p.id];
        return (
          <div key={p.id} className="item">
            <b>{p.persona}</b> <span className="muted">({p.name})</span>
            {rev && (
              <div className="small">
                Exposed: rules {icon(G, rev.nation)}, {FACTION_INFO[rev.faction].label}
              </div>
            )}
          </div>
        );
      })}
      <h3>Nations</h3>
      {G.nationOrder.map((n) => (
        <div key={n} className="item small">
          {icon(G, n)}: {G.nations[n]!.resources.map((r) => `${RESOURCE_INFO[r].emoji} ${RESOURCE_INFO[r].label}`).join(', ')}
        </div>
      ))}
    </div>
  );
}

function Result({ G, playerID }: { G: GState; playerID: string }) {
  const r = G.result!;
  const mine = G.players[playerID];
  const won = r.winners.includes(mine.faction);
  return (
    <div className="overlay">
      <div className="card stack">
        <h1>{won ? '🏆 Victory' : '💀 Defeat'}</h1>
        <p>{r.reason}</p>
        <h3>Who was who</h3>
        {G.roster.map((p) => {
          const s = G.players[p.id];
          return (
            <div key={p.id} className="item">
              <b>{p.persona}</b> ({p.name}): {icon(G, s.nation)}, {FACTION_INFO[s.faction].label}
            </div>
          );
        })}
        <p className="small muted">Unruled nations: {G.nationOrder.filter((n) => G.owners[n] === 'bot').map((n) => G.nations[n]!.icon).join(' ')}</p>
      </div>
    </div>
  );
}
