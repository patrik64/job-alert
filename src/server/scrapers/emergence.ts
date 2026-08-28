import { getroBoard } from './getro';

// careers.emcap.com still points here but lost its certificate; the board
// itself answers on talent.emcap.com
export const board = getroBoard({ host: 'talent.emcap.com', collectionId: 164 });
