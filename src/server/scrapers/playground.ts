import { getroBoard } from './getro';

// moved from consider to a getro network (id 54509) when the fund switched
// platforms in early september 2026, which renumbered every job — the board
// was wiped and baselined afresh on 2026-09-03. The page hides getro's name
// but its next.js layout and the collections api are getro's own.
export const board = getroBoard({ host: 'careers.playground.global', collectionId: 54509 });
