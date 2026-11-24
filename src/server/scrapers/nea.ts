import { considerBoard } from './consider';

// careers.nea.com went behind a cloudflare challenge in 2026-11 (it answers
// every script with a 403 "Just a moment..." page); the board itself is still
// published on consider's own domain, under the same id and the same job keys
export const board = considerBoard({ host: 'consider.com', boardId: 'nea', path: '/boards/vc/nea' });
