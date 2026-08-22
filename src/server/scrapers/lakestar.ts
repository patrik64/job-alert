import { considerBoard } from './consider';

// the board's own domains (jobs./careers.lakestar.com) no longer resolve; it
// lives on consider's
export const board = considerBoard({ host: 'consider.com', path: '/boards/vc/lakestar', boardId: 'lakestar' });
