import { considerBoard } from './consider';

// MCJ renamed itself Override in october 2026 and its board moved from
// jobs.mcj.vc to jobs.ovr.vc. Consider still knows the board as "mcj", and the
// jobs kept their keys
export const board = considerBoard({ host: 'jobs.ovr.vc', boardId: 'mcj' });
