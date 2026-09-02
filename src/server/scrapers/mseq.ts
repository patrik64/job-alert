import { niceboardBoard } from './niceboard';

// the board answers on the host's root; /jobs is a 404
export const board = niceboardBoard({ host: 'jobs.mseq.vc' });
