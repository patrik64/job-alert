import { considerBoard } from './consider';

// the aggregate /jobs page redirects to a talent-network login, but the
// login page hands out the csrf pair all the same and the api and the
// company pages answer without an account
export const board = considerBoard({ host: 'jobs.firstround.com', boardId: 'first-round-capital' });
