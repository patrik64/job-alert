import { greenhouseBoard } from './greenhouse';

// careers.point72.com is a greenhouse board of the firm's own openings — the
// one board here whose jobs are at the fund itself, not a portfolio
export const board = greenhouseBoard({
	token: 'point72',
	owner: { name: 'Point72', url: 'https://careers.point72.com/' }
});
