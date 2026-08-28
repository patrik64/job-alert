import { considerBoard } from './consider';

// the fund's site is playground.vc, but its job board lives on the
// playground.global domain
export const board = considerBoard({
	host: 'careers.playground.global',
	boardId: 'playground-global'
});
