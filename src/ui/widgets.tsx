import { RESOURCES, RESOURCE_INFO, type Resource } from '../game/constants';
import { handTotal } from '../game/game';
import type { Hand } from '../game/types';

export function HandView({ hand }: { hand: Hand }) {
  return (
    <div className="hand">
      {RESOURCES.map((r) => (
        <div key={r} className={`res ${hand[r] === 0 ? 'zero' : ''}`} style={{ borderLeftColor: RESOURCE_INFO[r].color }} title={RESOURCE_INFO[r].label}>
          <span>{RESOURCE_INFO[r].emoji}</span>
          <b>{hand[r]}</b>
        </div>
      ))}
    </div>
  );
}

interface PickerProps {
  value: Partial<Hand>;
  onChange: (v: Partial<Hand>) => void;
  /** Upper bound per resource (usually your hand). Resources with max 0 are hidden. */
  max?: Hand;
  /** If set, stops adding once the total reaches this. */
  total?: number;
  only?: Resource[];
}

export function GoodsPicker({ value, onChange, max, total, only }: PickerProps) {
  const list = (only ?? [...RESOURCES]).filter((r) => !max || max[r] > 0);
  const sum = handTotal(value);
  const set = (r: Resource, n: number) => onChange({ ...value, [r]: Math.max(0, n) });
  if (list.length === 0) return <p className="muted small">Nothing to offer.</p>;
  return (
    <div className="picker">
      {list.map((r) => {
        const v = value[r] ?? 0;
        const canAdd = (!max || v < max[r]) && (total === undefined || sum < total);
        return (
          <div className="cell" key={r} title={RESOURCE_INFO[r].label}>
            <button className="tiny" onClick={() => set(r, v - 1)} disabled={v === 0}>−</button>
            <span>
              {RESOURCE_INFO[r].emoji} {v}
            </span>
            <button className="tiny" onClick={() => set(r, v + 1)} disabled={!canAdd}>+</button>
          </div>
        );
      })}
    </div>
  );
}

export const clean = (h: Partial<Hand>): Partial<Hand> =>
  Object.fromEntries(Object.entries(h).filter(([, v]) => (v ?? 0) > 0)) as Partial<Hand>;
