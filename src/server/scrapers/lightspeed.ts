import { considerBoard } from './consider';

// the board lives at jobs.lsvp.com; jobs.lightspeedvp.com does not resolve
export const board = considerBoard({ host: 'jobs.lsvp.com', boardId: 'lightspeed' });
