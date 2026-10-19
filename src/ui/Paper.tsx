import { FACTION_INFO, RESOURCES, RESOURCE_INFO, type NationId } from '../game/constants';
import type { GState, NewsItem, PlayerSecret } from '../game/types';
import { Avatar, Die, nationIcon, nationName, personaOf, ResCard } from './common';

function Nat({ G, n }: { G: GState; n: NationId }) {
  return (
    <span className="nat" title={nationName(G, n)}>
      {nationIcon(G, n)}
    </span>
  );
}

/** One headline: [nation] [pictogram] [nation]  caption */
function Headline({ G, item }: { G: GState; item: NewsItem }) {
  const two = (a: NationId, verb: string, b: NationId, cap: string, sub: string) => (
    <div className="headline">
      <span className="who">
        <Nat G={G} n={a} />
        <span className="verb">{verb}</span>
        <Nat G={G} n={b} />
      </span>
      <span className="cap">
        {cap}
        <em>{sub}</em>
      </span>
    </div>
  );
  switch (item.t) {
    case 'envoy':
      return two(item.from, '✉️➜', item.to, 'Envoy sent', `${nationName(G, item.from)} reached out to ${nationName(G, item.to)}`);
    case 'accepted':
      return two(item.to, '🤝', item.from, 'Connection opened', `${nationName(G, item.to)} welcomed the envoy`);
    case 'declined':
      return two(item.to, '🚪', item.from, 'Envoy turned away', `${nationName(G, item.to)} refused ${nationName(G, item.from)}`);
    case 'expired':
      return two(item.to, '🕯️', item.from, 'Envoy ignored', `${nationName(G, item.to)} never answered`);
    case 'route':
      return two(item.a, RESOURCE_INFO[item.good].emoji, item.b, `${RESOURCE_INFO[item.good].label} trade opened`, 'Goods now flow both ways');
    case 'spy':
      return (
        <div className="headline">
          <span className="who">
            <span className="nat">🕵️</span>
            <span className="verb">➜</span>
            <Nat G={G} n={item.nation} />
          </span>
          <span className="cap">
            Spies spotted
            <em>Someone is asking who rules {nationName(G, item.nation)}</em>
          </span>
        </div>
      );
    case 'quiet':
      return (
        <div className="headline">
          <span className="who">
            <span className="nat">🌙</span>
          </span>
          <span className="cap">
            A quiet night<em>Nothing was reported</em>
          </span>
        </div>
      );
    default:
      return null;
  }
}

export function MorningPaper({ G, me, onClose }: { G: GState; me: PlayerSecret; onClose: () => void }) {
  const edition = G.news[G.news.length - 1];
  const headlines = edition.items.filter((i) => i.t !== 'market');
  const market = edition.items.find((i) => i.t === 'market') as Extract<NewsItem, { t: 'market' }> | undefined;
  const dispatches = me.inbox.filter((m) => m.round === edition.round && !m.text.startsWith('Harvest'));
  const land = me.harvest.land;
  const routes = me.harvest.routes;
  const gained = RESOURCES.filter((r) => land[r] + routes[r] > 0);

  return (
    <div className="overlay">
      <div className="paper">
        <div className="masthead">
          <h1>The Janus Herald</h1>
        </div>
        <div className="dateline">
          <span>Morning of Day {G.round}</span>
          <span>What happened in the night</span>
          <span>One silver piece</span>
        </div>

        {headlines.map((item, i) => (
          <Headline key={i} G={G} item={item} />
        ))}

        {market && (
          <>
            <h3>📈 Markets</h3>
            <div className="ticker">
              {RESOURCES.filter((r) => market.changes[r]).map((r) => (
                <span key={r} className="tick-item">
                  {RESOURCE_INFO[r].emoji} {RESOURCE_INFO[r].label}{' '}
                  <span className={market.changes[r]! > 0 ? 'up' : 'down'}>
                    {market.changes[r]! > 0 ? '▲' : '▼'} {Math.abs(market.changes[r]!)}%
                  </span>
                </span>
              ))}
            </div>
            <p className="small" style={{ marginTop: 6, fontStyle: 'italic' }}>
              Prices rise when a good is spent at night, and fall when it's sold by day.
            </p>
          </>
        )}

        <div className="private-box">
          <h3>🔒 For your eyes only</h3>
          <div className="row" style={{ alignItems: 'center', gap: 14 }}>
            <span className="row">
              {G.dice.map(([a, b], i) => (
                <span key={i} className="row" style={{ gap: 4 }}>
                  <Die value={a} size={34} />
                  <Die value={b} size={34} />
                </span>
              ))}
            </span>
            <span className="small">Today's harvest:</span>
            {gained.map((r) => (
              <ResCard key={r} res={r} small gain={land[r] + routes[r]} />
            ))}
          </div>
          {RESOURCES.some((r) => routes[r] > 0) && <p className="small" style={{ marginTop: 10 }}>🤝 Includes extra from your trade routes.</p>}
          {dispatches.map((m, i) => (
            <p key={i} className="small" style={{ marginTop: 8 }}>
              📜 {m.text}
            </p>
          ))}
        </div>

        <div className="paper-foot">
          <button className="primary big" onClick={onClose}>
            To the table ☀️
          </button>
        </div>
      </div>
    </div>
  );
}

export function VerdictOverlay({ G, onClose }: { G: GState; onClose: () => void }) {
  const v = G.verdicts[G.verdicts.length - 1];
  const target = v.target != null ? personaOf(G, v.target) : null;
  const rev = v.target != null ? G.revealed[v.target] : null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal reveal" onClick={(e) => e.stopPropagation()}>
        <h3>⚖️ The Tribunal has spoken</h3>
        {target && rev ? (
          <>
            <div className="center" style={{ gap: 18, margin: '18px 0' }}>
              <Avatar persona={target.persona} size={70} />
              <span style={{ fontSize: 30 }}>=</span>
              <div className="seal" style={{ width: 90, height: 90, fontSize: 52, margin: 0 }}>
                {nationIcon(G, rev.nation)}
              </div>
            </div>
            <h2>{target.persona} is exposed</h2>
            <span className={`faction-tag faction-${rev.faction}`}>{FACTION_INFO[rev.faction].label}</span>
            <p className="muted">
              {rev.faction === 'pact' ? 'A Pact agent unmasked!' : 'They were innocent…'}
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 60, margin: 12 }}>🤷</div>
            <h2>No majority</h2>
            <p className="muted">Nobody was exposed today.</p>
          </>
        )}
        <button className="primary" onClick={onClose}>
          Continue to night 🌙
        </button>
      </div>
    </div>
  );
}
