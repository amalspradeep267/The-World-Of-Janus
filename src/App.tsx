import { useEffect, useMemo, useState } from 'react';
import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import { P2P } from '@boardgame.io/p2p';
import { FRIENDS } from './config';
import { MAX_PLAYERS, MIN_PLAYERS } from './game/constants';
import { makeGame } from './game/game';
import { getCredentials, getSeat, isHost, markHost, newRoomCode, parseHash, roomHash, roomLink, setSeat, type Route } from './net/room';
import type { Settings } from './game/types';
import { Board } from './ui/Board';
import { setAudibleSeat } from './ui/sound';

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route.page === 'practice') return <Practice players={route.players} />;
  if (route.page === 'room') return <Room code={route.code} roster={route.roster} settings={route.settings} />;
  return <Home />;
}

function Home() {
  const [me, setMe] = useState(FRIENDS[0]);
  const [others, setOthers] = useState<string[]>([]);
  const [practiceN, setPracticeN] = useState(4);
  const [revealFaction, setRevealFaction] = useState(true);
  const roster = [me, ...others.filter((o) => o !== me)];
  const count = roster.length;

  const host = () => {
    const code = newRoomCode();
    markHost(code);
    setSeat(code, '0');
    location.hash = roomHash(code, roster, { revealFaction });
  };

  return (
    <div className="home">
      <div className="home-hero">
        <div className="mask">🎭</div>
        <h1>The World of Janus</h1>
        <p className="muted">Everyone knows who's at the table. Nobody knows who rules which city.</p>
      </div>
      <div className="home-grid">
        <div className="card">
          <h2>Host a game</h2>
          <p className="small muted">Your browser runs the game, so keep the tab open until it ends.</p>
          <label className="row small">
            I am
            <select value={me} onChange={(e) => setMe(e.target.value)}>
              {FRIENDS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <p className="small" style={{ marginTop: 10 }}>Who's playing?</p>
          <div className="friend-list small">
            {FRIENDS.filter((f) => f !== me).map((f) => (
              <label key={f}>
                <input
                  type="checkbox"
                  checked={others.includes(f)}
                  onChange={(e) => setOthers(e.target.checked ? [...others, f] : others.filter((o) => o !== f))}
                />
                {f}
              </label>
            ))}
          </div>
          <label className="row small" style={{ marginBottom: 12 }} title="Like Among Us's anonymous ejects">
            <input type="checkbox" checked={revealFaction} onChange={(e) => setRevealFaction(e.target.checked)} />
            ⚖️ Tribunal reveals the exposed player's faction
          </label>
          <button className="primary" disabled={count < MIN_PLAYERS || count > MAX_PLAYERS} onClick={host}>
            Create room ({count} players)
          </button>
          {count < MIN_PLAYERS && <p className="small muted">Pick at least {MIN_PLAYERS} players.</p>}
        </div>

        <div className="card">
          <h2>Join a game</h2>
          <p className="small muted">Open the invite link your host posted in Discord. It looks like:</p>
          <code className="small">…/#/room/KXQTM?p=Amal,Ben,Cara</code>
        </div>

        <div className="card">
          <h2>Practice on one screen</h2>
          <p className="small muted">Play every seat yourself to learn the rules or test changes. No network needed.</p>
          <div className="row">
            <select value={practiceN} onChange={(e) => setPracticeN(Number(e.target.value))}>
              {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
                <option key={n} value={n}>
                  {n} players
                </option>
              ))}
            </select>
            <button onClick={() => (location.hash = `#/practice?n=${practiceN}`)}>Start</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Room({ code, roster, settings }: { code: string; roster: string[]; settings: Settings }) {
  const [seat, setSeatState] = useState<string | null>(() => getSeat(code));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const host = isHost(code);
  const valid = roster.length >= MIN_PLAYERS && roster.length <= MAX_PLAYERS && roster.every((n) => FRIENDS.includes(n));

  const GameClient = useMemo(
    () =>
      Client({
        game: makeGame(roster, settings),
        board: Board,
        numPlayers: roster.length,
        multiplayer: P2P({ isHost: host, onError: (e) => setError(String(e?.message ?? e)) }),
        debug: false,
        loading: () => (
          <div className="home">
            <p>{host ? 'Opening the room…' : 'Looking for the host… Make sure they have the room open.'}</p>
          </div>
        ),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [code, roster.join(','), host, settings.revealFaction],
  );

  if (!valid) {
    return (
      <div className="home">
        <h1>Invalid room link</h1>
        <p className="muted">This link's player list doesn't match the friend allowlist.</p>
        <a href="#/">Back home</a>
      </div>
    );
  }

  if (seat == null) {
    return (
      <div className="home">
        <h1>Room {code}</h1>
        <p>Who are you?</p>
        <div className="row">
          {roster.map((name, i) =>
            i === 0 ? null : (
              <button
                key={name}
                onClick={() => {
                  setSeat(code, String(i));
                  setSeatState(String(i));
                }}
              >
                {name}
              </button>
            ),
          )}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>{roster[0]} is hosting.</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {host && (
        <div className="seat-tabs">
          <span className="small">
            🔗 Invite link for Discord: <code>{roomLink(code, roster, settings)}</code>
          </span>
          <button
            className="tiny"
            onClick={() => {
              navigator.clipboard?.writeText(roomLink(code, roster, settings)).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <span className="small muted">You're the host. Closing this tab ends the game for everyone.</span>
        </div>
      )}
      {error && (
        <div className="seat-tabs" style={{ color: 'var(--bad)' }}>
          Connection problem: {error}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <GameClient matchID={code} playerID={seat} credentials={getCredentials(code)} />
      </div>
    </div>
  );
}

function Practice({ players }: { players: number }) {
  const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, players));
  const [active, setActive] = useState('0');
  // Every practice seat is mounted at once; only the one on screen plays sounds.
  useEffect(() => {
    setAudibleSeat(active);
    return () => setAudibleSeat(null);
  }, [active]);
  const GameClient = useMemo(
    () =>
      Client({
        game: makeGame(Array.from({ length: n }, (_, i) => `Seat ${i + 1}`)),
        board: Board,
        numPlayers: n,
        multiplayer: Local(),
        debug: false,
      }),
    [n],
  );
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="seat-tabs">
        <a href="#/" className="small" style={{ marginRight: 8 }}>← Home</a>
        <span className="small muted">Viewing as:</span>
        {Array.from({ length: n }, (_, i) => String(i)).map((id) => (
          <button key={id} className={`tiny ${active === id ? 'active' : ''}`} onClick={() => setActive(id)}>
            Seat {Number(id) + 1}
          </button>
        ))}
      </div>
      {/* Every seat stays mounted so each one keeps its own connection to the local match. */}
      {Array.from({ length: n }, (_, i) => String(i)).map((id) => (
        <div key={id} style={{ display: active === id ? 'block' : 'none', flex: 1, minHeight: 0 }}>
          <GameClient matchID="practice" playerID={id} />
        </div>
      ))}
    </div>
  );
}
