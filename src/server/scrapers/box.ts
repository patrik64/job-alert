import { greenhouseBoard } from './greenhouse';

// careers.box.com is box's own careers site — a company hiring for itself,
// not a fund's portfolio. The site sits behind a cloudflare challenge; its
// openings are the ones on box's greenhouse board, which greenhouse's public
// board api serves as they are.
export const board = greenhouseBoard({
	token: 'boxinc',
	owner: { name: 'Box', url: 'https://careers.box.com/en/jobs/' }
});
