import { useEffect, useRef, useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import { COST, FACTION_INFO, FACTORY, MAX_ROUNDS, MAX_ROUTES_PER_CITY, RECIPE, RESOURCES, RESOURCE_INFO, TRIBUNAL_FROM_ROUND, type NationId } from '../game/constants';
import { routeCount } from '../game/game';
import type { GState } from '../game/types';
import { Avatar, Die, GoldCard, goodsEmoji, Modal, nationIcon, nationName, playerOf, Recipe, ResCard } from './common';
import { HexMap } from './HexMap';
import { BlackMarketModal, IdentityModal, MarketModal, NewsArchive, PlayersModal, TradeModal, TribunalModal, Welcome } from './Modals';
import { NationSheet } from './NationSheet';
import { MorningPaper, VerdictOverlay } from './Paper';
import { isMuted, play, setMuted } from './sound';
import { isHost } from '../net/room';

type Panel = null | 'trade' | 'market' | 'black' | 'tribunal' | 'identity' | 'players' | 'news';

function storageFlag(key: string): [boolean, () => void] {
  let v = false;
  try {
    v = localStorage.getItem(key) === '1';
  } catch {
    /* ignore */
  }
  return [
    v,
    () => {
      try {
        localStorage.setItem(key, '1');
      } catch {
        /* ignore */
      }
    },
  ];
}

export function Board(props: BoardProps<GState>) {
  const { G, ctx, playerID, isConnected, moves, matchID } = props;
  const me = playerID != null ? G.players[playerID] : undefined;
  const phase = ctx.phase as 'day' | 'night';

  const [selected, setSelected] = useState<NationId | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const welcomeKey = `janus:welcome:${matchID}:${playerID}`;
  const [welcomeSeen, markWelcome] = storageFlag(welcomeKey);
  const [welcome, setWelcome] = useState(!welcomeSeen && G.round <= 1);
  // Remember what this player has already seen, so new papers and verdicts pop up exactly once.
  const [paperSeen, setPaperSeen] = useState(G.news.length);
  const [forcePaper, setForcePaper] = useState(false);
  const [verdictSeen, setVerdictSeen] = useState(G.verdicts.length);
  const [revealQueue, setRevealQueue] = useState<NationId[]>([]);
  const knownRef = useRef<Set<string>>(new Set(Object.keys(me?.known ?? {})));
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [muted, setMutedState] = useState(isMuted());

  // ---- sound cues for significant moments only ----
  const sfx = (s: Parameters<typeof play>[0]) => play(s, playerID);
  const prev = useRef<{ phase: string; round: number; envoys: number; offers: number; log: number; plans: number; verdicts: number; over: boolean } | null>(null);
  useEffect(() => {
    if (!me) return;
    const myName = G.roster.find((p) => p.id === playerID)?.name ?? '';
    const now = {
      phase,
      round: G.round,
      envoys: G.envoys.filter((e) => e.to === me.nation && e.status === 'pending').length,
      offers: G.trades.filter((t) => t.to === playerID && t.status === 'open').length,
      log: G.publicLog.length,
      plans: me.plans.length,
      verdicts: G.verdicts.length,
      over: !!G.result,
    };
    const was = prev.current;
    prev.current = now;
    if (!was) return; // no sounds for the state we loaded into
    if (now.over && !was.over) return sfx(G.result!.winners.includes(me.faction) ? 'win' : 'lose');
    if (now.phase === 'night' && was.phase !== 'night') sfx('night');
    if (now.phase === 'day' && now.round > was.round) {
      sfx('dice');
      setTimeout(() => sfx('paper'), 450);
    }
    if (now.verdicts > was.verdicts) sfx('gavel');
    if (now.envoys > was.envoys) sfx('envoy');
    if (now.offers > was.offers) sfx('offer');
    if (now.plans > was.plans) sfx('order');
    // A trade or sale you were part of just went through.
    if (now.log > was.log && G.publicLog.slice(was.log).some((l) => l.text.includes(myName) && !l.text.startsWith('⚖️'))) sfx('coin');
  });

  useEffect(() => {
    if (!me) return;
    const fresh = Object.keys(me.known).filter((n) => !knownRef.current.has(n));
    if (fresh.length) {
      fresh.forEach((n) => knownRef.current.add(n));
      setRevealQueue((q) => [...q, ...(fresh as NationId[])]);
      if (prev.current) play('reveal', playerID);
    }
  }, [me?.known]);

  useEffect(() => setSelected(null), [phase]);

  if (!me) return <div className="home"><p>Spectating isn't supported yet.</p></div>;

  const ready = !!G.ready[playerID!];
  const showPaper = !welcome && ((phase === 'day' && G.news.length > paperSeen && G.round > 1) || forcePaper);
  const showVerdict = !welcome && !showPaper && G.verdicts.length > verdictSeen;
  const reveal = !welcome && !showPaper && !showVerdict ? revealQueue[0] : undefined;

  const incomingEnvoys = G.envoys.filter((e) => e.to === me.nation && e.status === 'pending');
  const incomingTrades = G.trades.filter((t) => t.to === playerID && t.status === 'open');
  const tribunalOpen = G.round >= TRIBUNAL_FROM_ROUND;

  const tools: { id: Panel; icon: string; label: string; show: boolean; disabled?: boolean; badge?: number; title?: string }[] = [
    { id: 'trade', icon: '🔁', label: 'Trade', show: phase === 'day' },
    { id: 'market', icon: '💰', label: 'Market', show: phase === 'day' },
    { id: 'black', icon: '🕶️', label: 'Black mkt', show: phase === 'night' && me.faction === 'syndicate' },
    {
      id: 'tribunal',
      icon: '⚖️',
      label: 'Tribunal',
      show: phase === 'day',
      disabled: !tribunalOpen,
      title: tribunalOpen ? 'Accuse a player' : `Opens on day ${TRIBUNAL_FROM_ROUND}`,
      badge: Object.keys(G.entrants).length || undefined,
    },
    { id: 'news', icon: '📰', label: 'News', show: true },
    { id: 'players', icon: '👥', label: 'Players', show: true },
  ];

  const hint =
    phase === 'day'
      ? 'Talk on Discord · trade or sell with the buttons on the right · then press Ready'
      : 'Click a city on the map to act in secret · then press Ready';

  return (
    <div className={`board ${phase}`}>
      <header className="topbar">
        <span className="logo">JANUS</span>
        <div className="stack" style={{ gap: 4 }}>
          <span className="rounds" title={`Round ${G.round} of ${MAX_ROUNDS}`}>
            {Array.from({ length: MAX_ROUNDS }, (_, i) => (
              <i key={i} className={i + 1 < G.round ? 'done' : i + 1 === G.round ? 'now' : ''} />
            ))}
          </span>
          <span className="small muted">Day {G.round} of {MAX_ROUNDS}</span>
        </div>
        <div className="phase-title">
          <b>{phase === 'day' ? '☀️ Day: Diplomacy' : '🌙 Night: Under the Table'}</b>
          <span>{phase === 'day' ? 'Everything you do now is public' : 'Everything you do now is secret'}</span>
        </div>
        <span className="spacer" />
        {!isConnected && <span className="small" style={{ color: 'var(--bad)' }}>⚠ Reconnecting…</span>}
        <div className="avatars">
          {G.roster.map((p) => (
            <Avatar
              key={p.id}
              name={p.name}
              ready={!!G.ready[p.id]}
              cards={G.handSizes[p.id]}
              tariffed={G.tariffed[p.id]}
              title={`${p.name} · ${G.handSizes[p.id] ?? 0} cards${G.tariffed[p.id] ? ' · tariffed' : ''}${G.ready[p.id] ? ' · ready' : ''}`}
            />
          ))}
        </div>
        <button className={`ready-btn big ${ready ? '' : 'primary'}`} onClick={() => moves.setReady(!ready)}>
          {ready ? '⏳ Waiting… (undo)' : phase === 'day' ? 'Ready for night 🌙' : 'Ready for morning ☀️'}
        </button>
        <button
          className="ghost icon-btn"
          title={muted ? 'Sound off' : 'Sound on'}
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="ghost icon-btn" title="Quit to the home screen" onClick={() => setConfirmQuit(true)}>
          🚪
        </button>
      </header>

      <div className="stage" onClick={() => setSelected(null)}>
        <HexMap G={G} myNation={me.nation} selected={selected} onSelect={setSelected} />

        {/* Hidden by default: people often screen-share on Discord. */}
        <div className="identity-badge" onClick={(e) => { e.stopPropagation(); setPanel('identity'); }} title="Click to see your secret">
          <span className="nicon">🎭</span>
          <span>
            <b>{playerOf(G, playerID!).name}</b>
            <span>
              🔒 Click to see your secret{G.tariffed[playerID!] ? ' · 🚫 tariffed' : ''}
              {me.captive && <b style={{ color: 'var(--bad)', display: 'inline', fontFamily: 'var(--sans)' }}> · ⛓️ paying ransom</b>}
            </span>
          </span>
        </div>

        {selected && (
          <NationSheet G={G} phase={phase} me={me} playerID={playerID!} nation={selected} moves={moves} onClose={() => setSelected(null)} />
        )}

        <div className="toasts" onClick={(e) => e.stopPropagation()}>
          {incomingEnvoys.map((e) => {
            const full = routeCount(G, me.nation) >= MAX_ROUTES_PER_CITY || routeCount(G, e.from) >= MAX_ROUTES_PER_CITY;
            return (
            <div key={e.id} className="toast">
              <span className="ti">{nationIcon(G, e.from)}✉️</span>
              <span className="tt">
                <b>{nationName(G, e.from)}</b> sent your city an envoy.{' '}
                {full ? `One of you already has ${MAX_ROUTES_PER_CITY} connections, so you can only refuse.` : 'Accept to connect and learn who sent it.'}
              </span>
              <button className="good tiny" disabled={full} onClick={() => moves.respondEnvoy(e.id, true)}>Accept</button>
              <button className="bad tiny" onClick={() => moves.respondEnvoy(e.id, false)}>Refuse</button>
            </div>
            );
          })}
          {incomingTrades.map((t) => (
            <div key={t.id} className="toast">
              <Avatar name={playerOf(G, t.from).name} />
              <span className="tt">
                <b>{playerOf(G, t.from).name}</b> offers <span style={{ fontSize: 16 }}>{goodsEmoji(t.give)}</span> for{' '}
                <span style={{ fontSize: 16 }}>{goodsEmoji(t.get)}</span>
              </span>
              <button className="good tiny" onClick={() => moves.respondTrade(t.id, true)}>Accept</button>
              <button className="bad tiny" onClick={() => moves.respondTrade(t.id, false)}>No</button>
            </div>
          ))}
        </div>

        <nav className="toolbar" onClick={(e) => e.stopPropagation()}>
          {tools
            .filter((t) => t.show)
            .map((t) => (
              <button key={t.id} className="tool" disabled={t.disabled} title={t.title ?? t.label} onClick={() => setPanel(t.id)}>
                {t.icon}
                <small>{t.label}</small>
                {t.badge ? <span className="badge">{t.badge}</span> : null}
              </button>
            ))}
        </nav>

        {G.rolls.length > 0 && (
          <div className="dice-tray" title="This morning's harvest roll (d12): tiles with this number produce">
            {G.rolls.map((n, i) => (
              <div key={`${G.round}-${i}`} className="dice-pair">
                <Die value={n} size={84} rolling />
                <span className="small muted">d12</span>
              </div>
            ))}
          </div>
        )}

        {!selected && <div className="hint-chip">{hint}</div>}
      </div>

      <footer className="handbar">
        <div className="hand">
          {RESOURCES.filter((r) => me.hand[r] > 0).map((r) => (
            <ResCard
              key={r}
              res={r}
              count={me.hand[r]}
              gain={phase === 'day' ? me.harvest.land[r] + me.harvest.routes[r] : undefined}
            />
          ))}
          {RESOURCES.every((r) => me.hand[r] === 0) && <span className="hand-empty">No cards in hand.</span>}
        </div>
        <GoldCard gold={me.gold} />
        <div className="recipes" title="What night actions cost (day trades are free)">
          <span>✉️ Envoy <Recipe recipe={RECIPE.envoy} hand={me.hand} /></span>
          <span>🤝 Supply line <Recipe recipe={RECIPE.route} hand={me.hand} /></span>
          <span>
            🏭 Factory <span className="cost">{FACTORY.tileCost}× tile + <Recipe recipe={RECIPE.factory} hand={me.hand} /></span>
          </span>
          <span>🕵️ Spies <span className="cost">🪙{COST.spyGold}</span></span>
        </div>
        <div className="orders">
          {phase === 'night' && me.plans.length === 0 && !me.security && <span className="small muted">No orders tonight yet</span>}
          {me.security > 0 && (
            <span className="order">
              🛡️ Security hired for tonight
              <button className="tiny ghost" onClick={() => moves.hireSecurity(false)} title="Dismiss and refund">✕</button>
            </span>
          )}
          {me.plans.map((p, i) => (
            <span key={i} className="order">
              {p.kind === 'envoy' && <>✉️ Envoy ➜ {nationIcon(G, p.to)}</>}
              {p.kind === 'route' && <>🤝 {RESOURCE_INFO[p.good].emoji} supply line ➜ {nationIcon(G, p.with)}</>}
              {p.kind === 'factory' && <>🏭 Factory on your {RESOURCE_INFO[p.good].emoji} tile</>}
              {p.kind === 'spy' && <>🕵️ Spy on {nationIcon(G, p.nation)}'s treasury</>}
              {p.kind === 'smuggle' && <>🕶️ Smuggle {RESOURCE_INFO[p.good].emoji}</>}
              {p.kind === 'pump' && <>🕶️ Pump {RESOURCE_INFO[p.good].emoji} ▲</>}
              {p.kind === 'kidnap' && <>🗡️ Kidnap in {nationIcon(G, p.nation)}, ruler: <Avatar name={playerOf(G, p.suspect).name} size={20} /></>}
              <button className="tiny ghost" onClick={() => moves.cancelPlan(i)} title="Cancel and get your cards back">✕</button>
            </span>
          ))}
        </div>
      </footer>

      {panel === 'trade' && <TradeModal G={G} me={me} playerID={playerID!} moves={moves} onClose={() => setPanel(null)} />}
      {panel === 'market' && <MarketModal G={G} me={me} playerID={playerID!} moves={moves} onClose={() => setPanel(null)} />}
      {panel === 'black' && <BlackMarketModal G={G} me={me} moves={moves} onClose={() => setPanel(null)} />}
      {panel === 'tribunal' && <TribunalModal G={G} me={me} playerID={playerID!} moves={moves} onClose={() => setPanel(null)} />}
      {panel === 'identity' && <IdentityModal G={G} me={me} onClose={() => setPanel(null)} />}
      {panel === 'players' && <PlayersModal G={G} onClose={() => setPanel(null)} />}
      {panel === 'news' && (
        <NewsArchive
          G={G}
          onOpenLatest={() => {
            setPanel(null);
            setForcePaper(true);
          }}
          onClose={() => setPanel(null)}
        />
      )}

      {welcome && (
        <Welcome
          G={G}
          me={me}
          onClose={() => {
            markWelcome();
            setWelcome(false);
          }}
        />
      )}
      {showPaper && (
        <MorningPaper
          G={G}
          me={me}
          onClose={() => {
            setPaperSeen(G.news.length);
            setForcePaper(false);
          }}
        />
      )}
      {showVerdict && <VerdictOverlay G={G} onClose={() => setVerdictSeen(G.verdicts.length)} />}
      {reveal && (
        <Modal icon="🔓" title="Secret uncovered" onClose={() => setRevealQueue((q) => q.slice(1))}>
          <div className="reveal">
            <div className="center" style={{ gap: 16, margin: '8px 0 14px' }}>
              <div className="seal" style={{ width: 90, height: 90, fontSize: 52, margin: 0 }}>{nationIcon(G, reveal)}</div>
              <span style={{ fontSize: 28 }}>=</span>
              {me.known[reveal] === 'bot' ? (
                <span style={{ fontSize: 52 }}>🤖</span>
              ) : (
                <Avatar name={playerOf(G, me.known[reveal]!).name} size={80} />
              )}
            </div>
            <h2>
              {nationName(G, reveal)} is ruled by{' '}
              {me.known[reveal] === 'bot' ? 'nobody (a bot city)' : playerOf(G, me.known[reveal]!).name}
            </h2>
            <p className="muted small">Only you know this. It's saved under 🎭 your secret.</p>
            <button className="primary" onClick={() => setRevealQueue((q) => q.slice(1))}>Got it</button>
          </div>
        </Modal>
      )}
      {G.result && <Result G={G} playerID={playerID!} />}
      {confirmQuit && (
        <Modal icon="🚪" title="Leave the game?" onClose={() => setConfirmQuit(false)}>
          <p>
            {matchID === 'practice'
              ? 'This practice game will be lost.'
              : isHost(matchID)
                ? "You're the host. Leaving ends the game for everyone."
                : 'You can rejoin any time with the same invite link, as long as the host keeps the game open.'}
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setConfirmQuit(false)}>Stay</button>
            <button className="bad" onClick={() => (location.hash = '#/')}>Quit to home</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Result({ G, playerID }: { G: GState; playerID: string }) {
  const r = G.result!;
  const mine = G.players[playerID];
  const won = r.winners.includes(mine.faction);
  return (
    <div className="overlay">
      <div className="modal wide reveal">
        <div style={{ fontSize: 70 }}>{won ? '🏆' : '💀'}</div>
        <h1>{won ? 'Victory' : 'Defeat'}</h1>
        <p>{r.reason}</p>
        <h3>The masks come off</h3>
        <div className="pick-grid center">
          {G.roster.map((p) => {
            const s = G.players[p.id];
            return (
              <div key={p.id} className="pickable" style={{ cursor: 'default', minWidth: 110 }}>
                <Avatar name={p.name} size={44} />
                <b className="small">{p.name}</b>
                <span style={{ fontSize: 26 }}>{nationIcon(G, s.nation)}</span>
                <span className={`faction-tag faction-${s.faction} small`} style={{ margin: 0 }}>{FACTION_INFO[s.faction].label}</span>
              </div>
            );
          })}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Bot cities: {G.nationOrder.filter((n) => G.owners[n] === 'bot').map((n) => nationIcon(G, n)).join(' ') || 'none'}
        </p>
        <a href="#/">Back to the lobby</a>
      </div>
    </div>
  );
}
