import { NATIONS, RESOURCES, TILES_PER_NATION, type NationId, type Resource } from './constants';
import type { Nation, Tile } from './types';

/** The subset of boardgame.io's random API we use, so map generation stays testable. */
export interface Rng {
  Number(): number;
  Shuffle<T>(deck: T[]): T[];
}

const DIRS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

export function hexesInRadius(radius: number): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push({ q, r });
    }
  }
  return out;
}

export function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng.Number() * list.length)];
}

// One strong, one medium and one weak number per nation keeps harvests roughly fair.
const NUMBER_TIERS = [
  [5, 6, 8, 9],
  [4, 5, 9, 10],
  [2, 3, 4, 10, 11, 12],
];

export function generateMap(rng: Rng, nationCount: number, radius: number) {
  const coords = hexesInRadius(radius);
  const index = new Map(coords.map((c, i) => [`${c.q},${c.r}`, i]));
  const neighbours = (i: number) =>
    DIRS.map(([dq, dr]) => index.get(`${coords[i].q + dq},${coords[i].r + dr}`)).filter(
      (n): n is number => n !== undefined,
    );

  const nationIds = rng.Shuffle(NATIONS.map((n) => n.id)).slice(0, nationCount) as NationId[];

  // Grow each nation outward from a seed; retry from scratch if two nations box each other in.
  let regions: number[][] = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    regions = [];
    const claimed = new Set<number>();
    let minGap = 3;
    for (const seed of rng.Shuffle(coords.map((_, i) => i))) {
      if (regions.length === nationCount) break;
      if (regions.every((reg) => hexDistance(coords[reg[0]], coords[seed]) >= minGap)) {
        regions.push([seed]);
        claimed.add(seed);
      }
    }
    while (regions.length < nationCount && minGap > 1) {
      minGap--;
      for (const seed of rng.Shuffle(coords.map((_, i) => i))) {
        if (regions.length === nationCount) break;
        if (!claimed.has(seed) && regions.every((reg) => hexDistance(coords[reg[0]], coords[seed]) >= minGap)) {
          regions.push([seed]);
          claimed.add(seed);
        }
      }
    }
    let stuck = false;
    for (let size = 1; size < TILES_PER_NATION && !stuck; size++) {
      for (const reg of regions) {
        const options = reg.flatMap(neighbours).filter((n) => !claimed.has(n));
        if (options.length === 0) {
          stuck = true;
          break;
        }
        const next = pick(rng, options);
        reg.push(next);
        claimed.add(next);
      }
    }
    if (!stuck && regions.length === nationCount) break;
  }

  const tiles: Tile[] = coords.map((c) => ({ ...c, nation: null, resource: null, number: null }));
  const nations: Partial<Record<NationId, Nation>> = {};
  const usage: Record<Resource, number> = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;

  regions.forEach((reg, i) => {
    const meta = NATIONS.find((n) => n.id === nationIds[i])!;
    // Prefer the least-used resources so every good exists somewhere on the map.
    const resources = rng
      .Shuffle([...RESOURCES])
      .sort((a, b) => usage[a] - usage[b])
      .slice(0, TILES_PER_NATION);
    resources.forEach((r) => usage[r]++);
    const numbers = rng.Shuffle(NUMBER_TIERS.map((tier) => pick(rng, tier)));
    reg.forEach((tileIdx, k) => {
      tiles[tileIdx].nation = meta.id;
      tiles[tileIdx].resource = resources[k];
      tiles[tileIdx].number = numbers[k];
    });
    nations[meta.id] = { id: meta.id, icon: meta.icon, name: meta.name, tiles: reg, resources };
  });

  return { tiles, nations, nationOrder: nationIds };
}
