import type { ReactNode } from 'react';
import { PERSONAS, RESOURCES, RESOURCE_INFO, type NationId, type Resource } from '../game/constants';
import type { GState, Hand } from '../game/types';

// ---------- people ----------

const AVATAR_COLORS = ['#e3b04b', '#7fc4e8', '#e88f7f', '#9fd18b', '#c79be6', '#f0c27f', '#7fe0c9', '#e87fb0', '#b9c27f', '#8fa2ff'];

export const personaOf = (G: GState, id: string) => G.roster.find((p) => p.id === id)!;

export function Avatar({ persona, size = 34, ready, title, cards }: { persona: string; size?: number; ready?: boolean; title?: string; cards?: number }) {
  const i = Math.max(0, PERSONAS.indexOf(persona));
  const initials = persona
    .split(' ')
    .filter((w) => w[0] === w[0].toUpperCase() && w !== 'the')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  return (
    <span
      className={`avatar ${ready === false ? 'waiting' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
      title={title ?? persona}
    >
      {initials}
      {ready && <span className="tick">✓</span>}
      {cards !== undefined && <span className="cards" title="Cards in hand (updated at dawn and after public deals)">🃏{cards}</span>}
    </span>
  );
}

// ---------- resources ----------

export function ResCard({
  res,
  count,
  gain,
  small,
  onClick,
  ghosted,
  title,
}: {
  res: Resource;
  count?: number;
  gain?: number;
  small?: boolean;
  onClick?: () => void;
  ghosted?: boolean;
  title?: string;
}) {
  const info = RESOURCE_INFO[res];
  return (
    <div
      className={`rcard ${small ? 'small' : ''} ${onClick ? 'clickable' : ''} ${ghosted ? 'ghosted' : ''}`}
      style={{ ['--c' as string]: info.color }}
      onClick={onClick}
      title={title ?? info.label}
    >
      <span className="emoji">{info.emoji}</span>
      <span className="name">{info.label}</span>
      {count !== undefined && <span className="count">{count}</span>}
      {!!gain && <span className="gain">+{gain}</span>}
    </div>
  );
}

export function GoldCard({ gold, small }: { gold: number; small?: boolean }) {
  return (
    <div className={`rcard gold-card ${small ? 'small' : ''}`} title="Gold: earned by selling at the market; pays for spies">
      <span className="emoji">🪙</span>
      <span className="name">Gold</span>
      <span className="count">{gold}</span>
    </div>
  );
}

export function ResPill({ res }: { res: Resource }) {
  const info = RESOURCE_INFO[res];
  return (
    <span className="res-pill" style={{ background: info.color }}>
      {info.emoji} {info.label}
    </span>
  );
}

/** Goods as a compact row of emoji, e.g. "🌾🌾⛏️". */
export const goodsEmoji = (h: Partial<Hand>) =>
  RESOURCES.flatMap((r) => Array(h[r] ?? 0).fill(RESOURCE_INFO[r].emoji)).join('');

/** Ingredients of a recipe the hand doesn't have enough of. */
export const missingFor = (hand: Hand, recipe: Partial<Hand>) =>
  (Object.keys(recipe) as Resource[]).filter((r) => hand[r] < (recipe[r] ?? 0));

/** A recipe as ingredient icons; ones you're missing are crossed out. */
export function Recipe({ recipe, hand }: { recipe: Partial<Hand>; hand?: Hand }) {
  return (
    <span className="cost">
      {(Object.keys(recipe) as Resource[]).flatMap((r) =>
        Array.from({ length: recipe[r] ?? 0 }, (_, i) => (
          <span key={`${r}${i}`} className={hand && hand[r] < (recipe[r] ?? 0) ? 'lacking' : ''} title={RESOURCE_INFO[r].label}>
            {RESOURCE_INFO[r].emoji}
          </span>
        )),
      )}
    </span>
  );
}

export const nationIcon = (G: GState, n: NationId) => G.nations[n]!.icon;
export const nationName = (G: GState, n: NationId) => G.nations[n]!.name;

// ---------- dice ----------

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

export function Die({ value, size = 46, rolling, delay = 0 }: { value: number; size?: number; rolling?: boolean; delay?: number }) {
  return (
    <svg className={`die ${rolling ? 'rolling' : ''}`} width={size} height={size} viewBox="0 0 100 100" style={{ animationDelay: `${delay}ms` }}>
      <rect x="4" y="4" width="92" height="92" rx="20" fill="#f7f1e3" stroke="#c9bfa5" strokeWidth="3" />
      {PIPS[value]?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" fill={value === 1 ? '#b3261e' : '#1d1a14'} />)}
    </svg>
  );
}

// ---------- modal ----------

export function Modal({
  icon,
  title,
  onClose,
  children,
  wide,
}: {
  icon?: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button className="close ghost tiny" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="modal-title">
          {icon && <span className="mi">{icon}</span>}
          <h2>{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}
