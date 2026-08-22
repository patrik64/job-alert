import { getroBoard } from './getro';

// the board lives at jobs.luxcapital.com; jobs.lux.vc does not resolve
export const board = getroBoard({ host: 'jobs.luxcapital.com', collectionId: 103 });
