import { considerBoard } from './consider';

// jobs.crv.com was let go on 2026-11-02 (the domain still points
// at Consider, which no longer knows it); the board itself carries on under
// Consider's own path for it
export const board = considerBoard({ host: 'consider.com', boardId: 'crv', path: '/boards/vc/crv' });
