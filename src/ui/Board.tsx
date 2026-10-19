import { useEffect, useRef, useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import { FACTION_INFO, MAX_ROUNDS, RESOURCES, RESOURCE_INFO, TRIBUNAL_FROM_ROUND, type NationId } from '../game/constants';
import type { GState } from '../game/types';
import { Avatar, Die, GoldCard, goodsEmoji, Modal, nationIcon, nationName, personaOf, ResCard } from './common';
import { HexMap } from './HexMap';
import { IdentityModal, MarketModal, NewsArchive, PlayersModal, TradeModal, TribunalModal, Welcome } from './Modals';
import { NationSheet } from './NationSheet';
import { MorningPaper, VerdictOverlay } from './Paper';

type Panel = null | 'trade' | 'market' | 'tribunal' | 'identity' | 'players' | 'news';

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

  useEffect(() => {
    if (!me) return;
    const fresh = Object.keys(me.known).filter((n) => !knownRef.current.has(n));
    if (fresh.length) {
      fresh.forEach((n) => knownRef.current.add(n));
      setRevealQueue((q) => [...q, ...(fresh as NationId[])]);
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
    {
      id: 'tribunal',
      icon: '⚖️',
      label: 'Tribunal',
      show: phase === 'day',
      disabled: !tribunalOpen,
      title: tribunalOpen ? 'Accuse a player' : `Opens on day ${TRIBUNAL_FROM_ROUND}`,
      badge: Object.values(G.votes).filter((v) => v === playerID).length || undefined,
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
            <Avatar key={p.id} persona={p.persona} ready={!!G.ready[p.id]} title={`${p.persona} (${p.name})${G.ready[p.id] ? ': ready' : ''}`} />
          ))}
        </div>
        <button className={`ready-btn big ${ready ? '' : 'primary'}`} onClick={() => moves.setReady(!ready)}>
          {ready ? '⏳ Waiting… (undo)' : phase === 'day' ? 'Ready for night 🌙' : 'Ready for morning ☀️'}
        </button>
      </header>

      <div className="stage" onClick={() => setSelected(null)}>
        <HexMap G={G} myNation={me.nation} selected={selected} onSelect={setSelected} />

        {/* Hidden by default: people often screen-share on Discord. */}
        <div className="identity-badge" onClick={(e) => { e.stopPropagation(); setPanel('identity'); }} title="Click to see your secret">
          <span className="nicon">🎭</span>
          <span>
            <b>{personaOf(G, playerID!).persona}</b>
            <span>🔒 Click to see your secret</span>
          </span>
        </div>

        {selected && (
          <NationSheet G={G} phase={phase} me={me} playerID={playerID!} nation={selected} moves={moves} onClose={() => setSelected(null)} />
        )}

        <div className="toasts" onClick={(e) => e.stopPropagation()}>
          {incomingEnvoys.map((e) => (
            <div key={e.id} className="toast">
              <span className="ti">{nationIcon(G, e.from)}✉️</span>
              <span className="tt">
                <b>{nationName(G, e.from)}</b> sent your city an envoy. Accept to connect and learn who sent it.
              </span>
              <button className="good tiny" onClick={() => moves.respondEnvoy(e.id, true)}>Accept</button>
              <button className="bad tiny" onClick={() => moves.respondEnvoy(e.id, false)}>Refuse</button>
            </div>
          ))}
          {incomingTrades.map((t) => (
            <div key={t.id} className="toast">
              <Avatar persona={personaOf(G, t.from).persona} />
              <span className="tt">
                <b>{personaOf(G, t.from).persona}</b> offers <span style={{ fontSize: 16 }}>{goodsEmoji(t.give)}</span> for{' '}
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

        {G.dice.length > 0 && (
          <div className="dice-tray" title="This morning's harvest roll: tiles with this number produce">
            {G.dice.map(([a, b], i) => (
              <div key={`${G.round}-${i}`} className="dice-pair">
                <Die value={a} rolling />
                <Die value={b} rolling delay={120} />
                <span className="dice-sum">{a + b}</span>
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
        <div className="orders">
          {phase === 'night' && me.plans.length === 0 && <span className="small muted">No orders tonight yet</span>}
          {me.plans.map((p, i) => (
            <span key={i} className="order">
              {p.kind === 'envoy' && <>✉️ Envoy ➜ {nationIcon(G, p.to)}</>}
              {p.kind === 'route' && <>🤝 {RESOURCE_INFO[p.good].emoji} trade ➜ {nationIcon(G, p.with)}</>}
              {p.kind === 'spy' && <>🕵️ {nationIcon(G, p.nation)} = <Avatar persona={personaOf(G, p.suspect).persona} size={20} />?</>}
              <button className="tiny ghost" onClick={() => moves.cancelPlan(i)} title="Cancel and get your cards back">✕</button>
            </span>
          ))}
        </div>
      </footer>

      {panel === 'trade' && <TradeModal G={G} me={me} playerID={playerID!} moves={moves} onClose={() => setPanel(null)} />}
      {panel === 'market' && <MarketModal G={G} me={me} moves={moves} onClose={() => setPanel(null)} />}
      {panel === 'tribunal' && <TribunalModal G={G} playerID={playerID!} moves={moves} onClose={() => setPanel(null)} />}
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
                <Avatar persona={personaOf(G, me.known[reveal]!).persona} size={80} />
              )}
            </div>
            <h2>
              {nationName(G, reveal)} is ruled by{' '}
              {me.known[reveal] === 'bot' ? 'nobody (a bot city)' : personaOf(G, me.known[reveal]!).persona}
            </h2>
            <p className="muted small">Only you know this. It's saved under 🎭 your secret.</p>
            <button className="primary" onClick={() => setRevealQueue((q) => q.slice(1))}>Got it</button>
          </div>
        </Modal>
      )}
      {G.result && <Result G={G} playerID={playerID!} />}
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
                <Avatar persona={p.persona} size={44} />
                <b className="small">{p.persona}</b>
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
