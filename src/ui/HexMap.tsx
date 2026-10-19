import { RESOURCE_INFO, type NationId } from '../game/constants';
import type { GState } from '../game/types';

const SIZE = 40;
const SQRT3 = Math.sqrt(3);

const center = (q: number, r: number) => ({ x: SIZE * SQRT3 * (q + r / 2), y: SIZE * 1.5 * r });

function hexPoints(cx: number, cy: number, s = SIZE - 1.5) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${cx + s * Math.cos(a)},${cy + s * Math.sin(a)}`;
  }).join(' ');
}

const pips = (n: number) => 6 - Math.abs(7 - n);

// Edge i runs from corner i to corner i+1 and faces this axial neighbour.
const EDGE_DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

function corner(cx: number, cy: number, i: number, s = SIZE) {
  const a = (Math.PI / 180) * (60 * i - 30);
  return { x: cx + s * Math.cos(a), y: cy + s * Math.sin(a) };
}

interface Props {
  G: GState;
  myNation?: NationId;
  selected: NationId | null;
  onSelect: (n: NationId | null) => void;
}

export function HexMap({ G, myNation, selected, onSelect }: Props) {
  const pts = G.tiles.map((t) => center(t.q, t.r));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = SIZE * 1.6;
  const viewBox = `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${
    Math.max(...ys) - Math.min(...ys) + pad * 2
  }`;
  const capital = (n: NationId) => pts[G.nations[n]!.tiles[0]];

  const ownerLabel = (n: NationId) => {
    if (n === myNation) return 'You';
    const o = G.owners[n];
    if (o === undefined) return null;
    if (o === 'bot') return 'No ruler';
    return G.roster.find((p) => p.id === o)?.persona ?? null;
  };

  return (
    <svg viewBox={viewBox} role="img" aria-label="Continent map" onClick={() => onSelect(null)}>
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--night)" />
        </marker>
      </defs>

      {G.tiles.map((t, i) => {
        const { x, y } = pts[i];
        if (!t.nation) return <polygon key={i} points={hexPoints(x, y)} fill="var(--sea)" stroke="#132231" />;
        const hit = G.rolls.includes(t.number!);
        const isSel = selected === t.nation;
        return (
          <g
            key={i}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(t.nation);
            }}
          >
            <polygon
              points={hexPoints(x, y)}
              fill={RESOURCE_INFO[t.resource!].color}
              stroke={isSel ? '#fff' : '#0e1015'}
              strokeWidth={isSel ? 3 : 1.5}
              opacity={selected && !isSel ? 0.7 : 1}
            />
            <text x={x} y={y - 19} textAnchor="middle" fontSize="13">
              {RESOURCE_INFO[t.resource!].emoji}
            </text>
            {(() => {
              // On a capital the nation banner sits in the middle, so the token moves aside.
              const isCapital = G.nations[t.nation]!.tiles[0] === i;
              const tx = isCapital ? x + 22 : x;
              const ty = isCapital ? y + 10 : y + 13;
              return (
                <>
                  <circle cx={tx} cy={ty} r={10} fill="#f4ecd8" stroke={hit ? 'var(--accent)' : 'none'} strokeWidth={3} filter={hit ? 'url(#glow)' : undefined} />
                  <text x={tx} y={ty + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={pips(t.number!) >= 5 ? '#b3261e' : '#222'}>
                    {t.number}
                  </text>
                </>
              );
            })()}
          </g>
        );
      })}

      {/* Nation borders: every tile edge that doesn't face the same nation */}
      {G.tiles.flatMap((t, i) => {
        if (!t.nation) return [];
        const { x, y } = pts[i];
        return EDGE_DIRS.flatMap(([dq, dr], e) => {
          const n = G.tiles.find((o) => o.q === t.q + dq && o.r === t.r + dr);
          if (n && n.nation === t.nation) return [];
          const a = corner(x, y, e, SIZE - 5);
          const b = corner(x, y, e + 1, SIZE - 5);
          return [
            <line key={`b${i}-${e}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={t.nation === myNation ? 'var(--accent)' : '#f4ecd8'} strokeWidth={3} strokeLinecap="round" pointerEvents="none" />,
          ];
        });
      })}

      {/* Trade routes and envoys in flight */}
      {G.routes.map((rt, i) => {
        const a = capital(rt.a);
        const b = capital(rt.b);
        return (
          <g key={`r${i}`} pointerEvents="none">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f4ecd8" strokeWidth={2 + rt.goods.length * 1.5} strokeOpacity={0.75} strokeLinecap="round" />
            {rt.goods.length > 0 && (
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fontSize="13">
                {rt.goods.map((g) => RESOURCE_INFO[g].emoji).join('')}
              </text>
            )}
          </g>
        );
      })}
      {G.envoys
        .filter((e) => e.status === 'pending')
        .map((e) => {
          const a = capital(e.from);
          const b = capital(e.to);
          return (
            // Stop short of the target's banner so the arrowhead stays visible.
            <line
              key={`e${e.id}`}
              x1={a.x}
              y1={a.y}
              x2={b.x - ((b.x - a.x) / Math.hypot(b.x - a.x, b.y - a.y)) * 18}
              y2={b.y - ((b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y)) * 18}
              stroke="var(--night)"
              strokeWidth={2}
              strokeDasharray="6 5"
              markerEnd="url(#arrow)"
              pointerEvents="none"
            />
          );
        })}

      {/* Nation banners on capitals */}
      {G.nationOrder.map((n) => {
        const { x, y } = capital(n);
        const label = ownerLabel(n);
        return (
          <g
            key={n}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(n);
            }}
          >
            <circle cx={x} cy={y + 2} r={15} fill="#12141a" stroke={selected === n ? '#fff' : 'var(--accent)'} strokeWidth={2} />
            <text x={x} y={y + 9} textAnchor="middle" fontSize="18">
              {G.nations[n]!.icon}
            </text>
            {label && (
              <g pointerEvents="none">
                <rect x={x - 38} y={y + 20} width={76} height={16} rx={8} fill="#12141a" opacity={0.9} />
                <text x={x} y={y + 32} textAnchor="middle" fontSize="10" fill={label === 'You' ? 'var(--accent)' : '#e8e6e1'}>
                  {label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
