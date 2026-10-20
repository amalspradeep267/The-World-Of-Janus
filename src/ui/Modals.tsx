import { useState } from 'react';
import { FACTION_INFO, MAX_ROUNDS, PUMP, RECIPE, RESOURCES, RESOURCE_INFO, TRIBUNAL, TRIBUNAL_FROM_ROUND, type NationId, type Resource } from '../game/constants';
import { handTotal, saleValue, smugglePrice } from '../game/game';
import type { GState, Hand, PlayerSecret } from '../game/types';
import { Avatar, GoldCard, goodsEmoji, Modal, nationIcon, nationName, playerOf, Recipe, ResCard, ResPill } from './common';

type Moves = Record<string, (...args: any[]) => void>;

// ---------- Trade ----------

export function TradeModal({ G, me, playerID, moves, onClose }: { G: GState; me: PlayerSecret; playerID: string; moves: Moves; onClose: () => void }) {
  const others = G.roster.filter((p) => p.id !== playerID);
  const [to, setTo] = useState<string | null>(null);
  const [give, setGive] = useState<Partial<Hand>>({});
  const [get, setGet] = useState<Partial<Hand>>({});
  const mineOpen = G.trades.filter((t) => t.from === playerID && t.status === 'open');
  const add = (h: Partial<Hand>, set: (h: Partial<Hand>) => void, r: Resource, d: number, max = 99) =>
    set({ ...h, [r]: Math.max(0, Math.min(max, (h[r] ?? 0) + d)) });

  return (
    <Modal icon="🔁" title="Propose a trade" onClose={onClose}>
      <p className="small muted">Trades are public. Everyone will see what you gave away.</p>
      {G.tariffed[playerID] && <p className="small" style={{ color: 'var(--bad)' }}>🚫 You pay a 5-gold tariff on every trade.</p>}

      <div className="step"><i>1</i> Trade with</div>
      <div className="pick-grid">
        {others.map((p) => (
          <div key={p.id} className={`pickable ${to === p.id ? 'on' : ''}`} onClick={() => setTo(p.id)}>
            <Avatar name={p.name} />
            <small>{p.name}</small>
          </div>
        ))}
      </div>

      <div className="step"><i>2</i> You give <span className="muted small">(click your cards)</span></div>
      <div className="row">
        {RESOURCES.filter((r) => me.hand[r] > 0).map((r) => (
          <ResCard key={r} res={r} small count={give[r] || undefined} onClick={() => add(give, setGive, r, 1, me.hand[r])} ghosted={!give[r]} title={`You have ${me.hand[r]}`} />
        ))}
        {handTotal(give) > 0 && <button className="tiny ghost" onClick={() => setGive({})}>clear</button>}
      </div>

      <div className="step"><i>3</i> You want</div>
      <div className="row">
        {RESOURCES.map((r) => (
          <ResCard key={r} res={r} small count={get[r] || undefined} onClick={() => add(get, setGet, r, 1)} ghosted={!get[r]} />
        ))}
        {handTotal(get) > 0 && <button className="tiny ghost" onClick={() => setGet({})}>clear</button>}
      </div>

      <div className="row" style={{ marginTop: 18, justifyContent: 'space-between' }}>
        <span style={{ fontSize: 20 }}>
          {goodsEmoji(give) || '…'} ➜ {goodsEmoji(get) || '…'}
        </span>
        <button
          className="primary"
          disabled={!to || handTotal(give) === 0 || handTotal(get) === 0}
          onClick={() => {
            moves.proposeTrade(to, clean(give), clean(get));
            setGive({});
            setGet({});
          }}
        >
          Send offer
        </button>
      </div>

      {mineOpen.length > 0 && (
        <>
          <div className="step">Your open offers</div>
          {mineOpen.map((t) => (
            <div key={t.id} className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="row">
                <Avatar name={playerOf(G, t.to).name} size={24} /> {goodsEmoji(t.give)} ➜ {goodsEmoji(t.get)}
              </span>
              <button className="tiny" onClick={() => moves.cancelTrade(t.id)}>Withdraw</button>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

const clean = (h: Partial<Hand>): Partial<Hand> =>
  Object.fromEntries(Object.entries(h).filter(([, v]) => (v ?? 0) > 0)) as Partial<Hand>;

// ---------- Market ----------

export function MarketModal({ G, me, playerID, moves, onClose }: { G: GState; me: PlayerSecret; playerID: string; moves: Moves; onClose: () => void }) {
  return (
    <Modal icon="💰" title="Market" onClose={onClose}>
      <p className="small muted">Sell cards for gold. Gold pays for spies. Every sale is public, and spies can see how much a city earned, so sales can give you away.</p>
      {G.tariffed[playerID] && <p className="small" style={{ color: 'var(--bad)' }}>🚫 You were exposed by the Tribunal: your sales pay 25% less.</p>}
      <div className="row" style={{ margin: '6px 0 10px' }}>
        <GoldCard gold={me.gold} small />
      </div>
      {RESOURCES.map((r) => {
        const ch = G.priceChange[r];
        return (
          <div key={r} className="market-row">
            <span className="em">{RESOURCE_INFO[r].emoji}</span>
            <span>{RESOURCE_INFO[r].label}</span>
            <b>🪙 {G.prices[r]}</b>
            <span className={ch ? (ch > 0 ? 'up' : 'down') : 'muted'}>{ch ? `${ch > 0 ? '▲' : '▼'} ${Math.abs(ch)}%` : '–'}</span>
            <button disabled={me.hand[r] < 1} onClick={() => moves.sell(r, 1)} title={`You have ${me.hand[r]}`}>
              Sell 1 → 🪙{saleValue(G, playerID, r, 1)}
            </button>
          </div>
        );
      })}
    </Modal>
  );
}

// ---------- Black market (night) ----------

export function BlackMarketModal({ G, me, moves, onClose }: { G: GState; me: PlayerSecret; moves: Moves; onClose: () => void }) {
  return (
    <Modal icon="🕶️" title="Black market" onClose={onClose}>
      <p className="small muted">
        Syndicate only. <b>Smuggle</b> a card without trading for it in public. <b>Pump</b> a price so you can sell high tomorrow. The news
        shows the price jump, but not who caused it. Spies <i>can</i> see the gold you spend here.
      </p>
      <div className="row" style={{ margin: '6px 0 10px' }}>
        <GoldCard gold={me.gold} small />
        <span className="small muted">
          Recipes: ✉️ <Recipe recipe={RECIPE.envoy} hand={me.hand} /> · 🤝 <Recipe recipe={RECIPE.route} hand={me.hand} />
        </span>
      </div>
      {RESOURCES.map((r) => {
        const cost = smugglePrice(G, r);
        return (
          <div key={r} className="market-row" style={{ gridTemplateColumns: '40px 1fr 60px 120px 120px' }}>
            <span className="em">{RESOURCE_INFO[r].emoji}</span>
            <span>{RESOURCE_INFO[r].label}</span>
            <span className="muted small">you: {me.hand[r]}</span>
            <button disabled={me.gold < cost} onClick={() => moves.planSmuggle(r)} title="Delivered in the morning">
              Smuggle 🪙{cost}
            </button>
            <button disabled={me.gold < PUMP.gold} onClick={() => moves.planPump(r)} title="Raises tomorrow's price">
              Pump ▲ 🪙{PUMP.gold}
            </button>
          </div>
        );
      })}
    </Modal>
  );
}

// ---------- Tribunal ----------

export function TribunalModal({ G, me, playerID, moves, onClose }: { G: GState; me: PlayerSecret; playerID: string; moves: Moves; onClose: () => void }) {
  const entrants = G.roster.filter((p) => G.entrants[p.id]);
  const inside = !!G.entrants[playerID];
  const convenes = entrants.length >= TRIBUNAL.minEntrants;
  const majority = Math.floor(Math.max(entrants.length, TRIBUNAL.minEntrants) / 2) + 1;
  const myVote = G.votes[playerID];
  return (
    <Modal icon="⚖️" title="Tribunal" onClose={onClose}>
      <p className="small muted">
        Pay to enter, or stay out. At dusk it sits only if <b>{TRIBUNAL.minEntrants}+</b> players entered. A majority of entrants exposes the
        accused: their city{G.settings.revealFaction ? ' and faction are' : ' is'} revealed and they pay a 🚫 tariff. Expose an innocent and
        everyone who accused them is fined 🪙{TRIBUNAL.innocentFine}.
      </p>

      <div className="step">
        🏛️ In session: {entrants.length} of {TRIBUNAL.minEntrants} needed {convenes && '✓'}
      </div>
      <div className="row">
        {entrants.length === 0 && <span className="small muted">Nobody has entered yet.</span>}
        {entrants.map((p) => (
          <span key={p.id} className="row small">
            <Avatar name={p.name} size={26} /> {p.name}
          </span>
        ))}
      </div>
      {!inside ? (
        <button className="primary" style={{ marginTop: 12 }} disabled={me.gold < TRIBUNAL.entryGold} onClick={() => moves.enterTribunal()}>
          Enter the Tribunal · 🪙{TRIBUNAL.entryGold}
        </button>
      ) : (
        <>
          <div className="step">
            Accuse{' '}
            <span className="muted small">{convenes ? `(${majority} of ${entrants.length} entrants needed)` : '(waiting for more entrants)'}</span>
          </div>
          <div className="pick-grid">
            {G.roster
              .filter((p) => p.id !== playerID)
              .map((p) => {
                const count = entrants.filter((e) => G.votes[e.id] === p.id).length;
                const rev = G.revealed[p.id];
                return (
                  <div
                    key={p.id}
                    className={`pickable ${myVote === p.id ? 'on' : ''}`}
                    style={{ opacity: rev ? 0.5 : 1, cursor: rev ? 'default' : 'pointer' }}
                    onClick={() => !rev && moves.vote(myVote === p.id ? null : p.id)}
                  >
                    <Avatar name={p.name} size={46} />
                    <small>{p.name}</small>
                    {rev ? (
                      <small>{nationIcon(G, rev.nation)} exposed</small>
                    ) : (
                      <span className="vote-dots">
                        {Array.from({ length: majority }, (_, i) => (
                          <i key={i} className={i < count ? '' : 'empty'} />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            {myVote ? 'Click your accused again to withdraw. You can change your vote until dusk.' : 'You have not accused anyone.'}
          </p>
          {me.faction === 'trader' && (
            <div className="item stack" style={{ marginTop: 12, background: '#2e2a1c', border: '1px solid var(--gold)' }}>
              <b>🟡 Your secret veto</b>
              <span className="small muted">
                Strike down today's verdict, whoever it hits. Nobody can see it's armed; the news only says "a secret veto". Refunded if
                there's no verdict.
              </span>
              <button className={me.veto ? 'good' : ''} disabled={!me.veto && me.gold < TRIBUNAL.vetoGold} onClick={() => moves.armVeto(!me.veto)}>
                {me.veto ? '✓ Veto armed (click to disarm)' : `Arm veto · 🪙${TRIBUNAL.vetoGold}`}
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ---------- Identity ----------

export function IdentityModal({ G, me, onClose }: { G: GState; me: PlayerSecret; onClose: () => void }) {
  const known = Object.entries(me.known).filter(([n]) => n !== me.nation) as [NationId, string][];
  return (
    <Modal icon="🎭" title="Your secret" onClose={onClose}>
      <div className="reveal">
        <div className="seal">{nationIcon(G, me.nation)}</div>
        <h2>You rule {nationName(G, me.nation)}</h2>
        <span className={`faction-tag faction-${me.faction}`}>{FACTION_INFO[me.faction].label}</span>
        <p>{FACTION_INFO[me.faction].goal}</p>
        <div className="center" style={{ gap: 6, margin: '8px 0 4px' }}>
          {G.nations[me.nation]!.resources.map((r) => (
            <ResPill key={r} res={r} />
          ))}
        </div>
      </div>
      <div className="step">🔍 What you know</div>
      {known.length === 0 && <p className="small muted">Nothing yet. Accept envoys or send spies to find out who rules what.</p>}
      <div className="pick-grid">
        {known.map(([n, who]) => (
          <div key={n} className="pickable" style={{ cursor: 'default' }}>
            <span style={{ fontSize: 26 }}>{nationIcon(G, n)}</span>
            {who === 'bot' ? <small>nobody</small> : <Avatar name={playerOf(G, who).name} size={26} />}
            <small>{who === 'bot' ? 'bot' : playerOf(G, who).name}</small>
          </div>
        ))}
      </div>
      {me.inbox.filter((m) => !m.text.startsWith('Harvest')).length > 0 && (
        <>
          <div className="step">📜 Private notes</div>
          {[...me.inbox]
            .reverse()
            .filter((m) => !m.text.startsWith('Harvest'))
            .map((m, i) => (
              <p key={i} className="small">
                <span className="muted">Day {m.round || 1} · </span>
                {m.text}
              </p>
            ))}
        </>
      )}
    </Modal>
  );
}

// ---------- Players ----------

export function PlayersModal({ G, onClose }: { G: GState; onClose: () => void }) {
  const recent = [...G.publicLog].reverse().slice(0, 12);
  return (
    <Modal icon="👥" title="The table" onClose={onClose}>
      <div className="pick-grid">
        {G.roster.map((p) => {
          const rev = G.revealed[p.id];
          return (
            <div key={p.id} className="pickable" style={{ cursor: 'default', minWidth: 96 }}>
              <Avatar name={p.name} size={44} />
              <b className="small">{p.name}</b>
              <small>{p.name}</small>
              <small>🃏 {G.handSizes[p.id] ?? 0} cards</small>
              {rev && (
                <small>
                  {nationIcon(G, rev.nation)} {rev.faction ? FACTION_INFO[rev.faction].label : 'faction secret'}
                </small>
              )}
            </div>
          );
        })}
      </div>
      <div className="step">📣 Public record</div>
      {recent.length === 0 && <p className="small muted">No trades or sales yet.</p>}
      {recent.map((l, i) => (
        <p key={i} className="small">
          <span className="muted">Day {l.round} · </span>
          {l.text}
        </p>
      ))}
    </Modal>
  );
}

// ---------- News archive ----------

export function NewsArchive({ G, onOpenLatest, onClose }: { G: GState; onOpenLatest: () => void; onClose: () => void }) {
  return (
    <Modal icon="📰" title="The Janus Herald" onClose={onClose}>
      {G.news.length > 1 && (
        <button className="primary" onClick={onOpenLatest} style={{ marginBottom: 14 }}>
          Reread this morning's paper
        </button>
      )}
      {[...G.news].reverse().map((ed) => (
        <div key={ed.round} style={{ marginBottom: 12 }}>
          <h3>{ed.round === 0 ? 'Prologue' : `After night ${ed.round}`}</h3>
          <div className="row" style={{ fontSize: 18 }}>
            {ed.items.map((it, i) => {
              switch (it.t) {
                case 'envoy':
                  return <span key={i} title="Envoy sent">{nationIcon(G, it.from)}✉️{nationIcon(G, it.to)}</span>;
                case 'accepted':
                  return <span key={i} title="Connection opened">{nationIcon(G, it.to)}🤝{nationIcon(G, it.from)}</span>;
                case 'declined':
                  return <span key={i} title="Envoy refused">{nationIcon(G, it.to)}🚪{nationIcon(G, it.from)}</span>;
                case 'expired':
                  return <span key={i} title="Envoy ignored">{nationIcon(G, it.to)}🕯️{nationIcon(G, it.from)}</span>;
                case 'route':
                  return <span key={i} title="Trade opened">{nationIcon(G, it.a)}{RESOURCE_INFO[it.good].emoji}{nationIcon(G, it.b)}</span>;
                case 'spy':
                  return <span key={i} title="Spies spotted">🕵️{nationIcon(G, it.nation)}</span>;
                case 'prologue':
                  return <span key={i} className="small">{it.nations} cities, {it.players} ruled by players</span>;
                case 'market':
                  return (
                    <span key={i} className="small">
                      {RESOURCES.filter((r) => it.changes[r]).map((r) => `${RESOURCE_INFO[r].emoji}${it.changes[r]! > 0 ? '▲' : '▼'}`).join(' ')}
                    </span>
                  );
                default:
                  return <span key={i} className="small muted">quiet</span>;
              }
            })}
          </div>
        </div>
      ))}
    </Modal>
  );
}

// ---------- First visit: how to play, then your secret ----------

export function Welcome({ G, me, onClose }: { G: GState; me: PlayerSecret; onClose: () => void }) {
  const [step, setStep] = useState(0);
  if (step === 0) {
    return (
      <div className="overlay">
        <div className="modal wide">
          <h1 style={{ textAlign: 'center' }}>🎭 The World of Janus</h1>
          <p className="muted" style={{ textAlign: 'center' }}>Everyone knows who's playing. Nobody knows who rules which city.</p>
          <div className="howto">
            <div><span className="hi">🎭</span><b>You rule a city</b><span>in secret. Everyone knows who's playing; nobody knows who rules what.</span></div>
            <div><span className="hi">☀️</span><b>Day</b><span>Talk on Discord. Trade cards openly. Accuse at the ⚖️ Tribunal.</span></div>
            <div><span className="hi">🌙</span><b>Night</b><span>Click a city on the map to send envoys, open trade or spy. Each action needs specific cards.</span></div>
            <div><span className="hi">🔁</span><b>Cover your tracks</b><span>Trade by day for the cards your night plans need. Every trade and sale is public.</span></div>
            <div><span className="hi">🕵️</span><b>Spies</b><span>read a city's treasury. Match its gold to the public sales to unmask its ruler.</span></div>
            <div><span className="hi">📰</span><b>Morning news</b><span>shows what each city did, but never who did it.</span></div>
          </div>
          <p className="small muted" style={{ textAlign: 'center' }}>
            {MAX_ROUNDS} rounds. The Tribunal opens on day {TRIBUNAL_FROM_ROUND}. When you're done with a phase, press <b>Ready</b>.
          </p>
          <div className="center" style={{ marginTop: 14 }}>
            <button className="primary big" onClick={() => setStep(1)}>Reveal my secret 🔒</button>
          </div>
        </div>
      </div>
    );
  }
  const partners = (Object.entries(me.known) as [NationId, string][]).filter(([n]) => n !== me.nation);
  return (
    <div className="overlay">
      <div className="modal reveal">
        <h3>Only you can see this</h3>
        <div className="seal">{nationIcon(G, me.nation)}</div>
        <h2>You rule {nationName(G, me.nation)}</h2>
        <span className={`faction-tag faction-${me.faction}`}>{FACTION_INFO[me.faction].label}</span>
        <p>{FACTION_INFO[me.faction].goal}</p>
        {partners.length > 0 && (
          <div className="stack" style={{ alignItems: 'center', margin: '10px 0' }}>
            <span className="small muted">Your trusted ally:</span>
            {partners.map(([n, who]) => (
              <span key={n} className="row">
                <span style={{ fontSize: 26 }}>{nationIcon(G, n)}</span> = <Avatar name={playerOf(G, who).name} size={28} /> {playerOf(G, who).name}
              </span>
            ))}
          </div>
        )}
        <button className="primary big" onClick={onClose}>Begin ☀️</button>
      </div>
    </div>
  );
}
