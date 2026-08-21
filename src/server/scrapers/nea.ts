import { considerBoard } from './consider';

// the board lives at careers.nea.com; jobs.nea.com does not resolve
export const board = considerBoard({ host: 'careers.nea.com', boardId: 'nea' });
