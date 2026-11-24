/* Goals: three per wave, each met goal earns a star on the end card. */

export interface RunStats {
  score: number; barrels: number; barrelTot: number; pearls: number;
  airs: number; near: number; hits: number; wipes: number; bestMult: number;
}

export interface Goal {
  kind: string;
  text: string;
  /** progress 0..1 while riding */
  prog: (s: RunStats) => number;
  /** "clean" goals start met and can be lost; the rest start unmet and lock in once reached */
  clean?: boolean;
  done: boolean;
  failed: boolean;
}

type Make = (size: number) => Omit<Goal, 'done' | 'failed'>;

/* size is the wave size (about 0.8 to 1.3); bigger waves ask a little more */
const POOL: Make[] = [
  sz => { const n = sz > 1.1 ? 3 : 2; return { kind: 'barrels', text: `Ride ${n} barrels`, prog: s => s.barrels / n }; },
  sz => { const n = Math.round(6 * sz); return { kind: 'pearls', text: `Grab ${n} pearls`, prog: s => s.pearls / n }; },
  () => ({ kind: 'airs', text: 'Land 2 airs', prog: s => s.airs / 2 }),
  () => ({ kind: 'near', text: '3 close calls', prog: s => s.near / 3 }),
  () => ({ kind: 'combo', text: 'Reach a ×5 combo', prog: s => (s.bestMult - 1) / 4 }),
  sz => { const n = Math.round(12000 * sz / 1000) * 1000; return { kind: 'score', text: `Score ${n.toLocaleString('en-US')}`, prog: s => s.score / n }; },
  () => ({ kind: 'tube', text: '4s inside the barrel', prog: s => s.barrelTot / 4 }),
  () => ({ kind: 'clean', text: 'No hits or wipeouts', prog: s => (s.hits + s.wipes === 0 ? 1 : 0), clean: true }),
];

export function pickGoals(size: number): Goal[] {
  const bag = POOL.slice();
  const out: Goal[] = [];
  while (out.length < 3) {
    const g = bag.splice(Math.floor(Math.random() * bag.length), 1)[0](size);
    out.push({ ...g, done: false, failed: false });
  }
  return out;
}

/** Updates goal state; returns goals that were just completed this call. */
export function checkGoals(goals: Goal[], s: RunStats): Goal[] {
  const fresh: Goal[] = [];
  for (const g of goals) {
    if (g.clean) { if (!g.failed && g.prog(s) < 1) g.failed = true; continue; }
    if (!g.done && g.prog(s) >= 1) { g.done = true; fresh.push(g); }
  }
  return fresh;
}

/** At the end of the run, clean goals that survived count as met. */
export function finishGoals(goals: Goal[]): number {
  for (const g of goals) if (g.clean && !g.failed) g.done = true;
  return goals.filter(g => g.done).length;
}
