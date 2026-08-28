import { considerNextBoard } from './considernext';

// moved from the old consider.ts search api to consider's rebuilt next.js
// board on 2026-08-28, which renumbered every job — the board was wiped and
// baselined afresh that day
export const board = considerNextBoard({ host: 'jobs.a16z.com' });
