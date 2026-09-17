import { getroBoard } from './getro';

// moved from consider to a getro network (id 8474) in september 2026, which
// renumbered every job — the board was wiped and baselined afresh on
// 2026-09-17. The old jobs.nextview.vc host now points at getro's servers
// without a certificate for that name, so the board is read from getro's own
// hostname
export const board = getroBoard({ host: 'nextview.getro.com', collectionId: 8474 });
