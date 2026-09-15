import { getroBoard } from './getro';

// moved from consider to a getro network (id 53552) in september 2026, which
// renumbered every job — the board was wiped and baselined afresh on
// 2026-09-15. The page hides getro's name, but its next.js layout and the
// collections api are getro's own
export const board = getroBoard({ host: 'careers.creandum.com', collectionId: 53552 });
