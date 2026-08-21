import { getroBoard } from './getro';

// the board's custom domain, jobs.indexventures.com, no longer serves it (it
// points at the fund's own site with a certificate for another name); the
// board itself lives on getro's subdomain
export const board = getroBoard({ host: 'indexventures.getro.com', collectionId: 1629 });
