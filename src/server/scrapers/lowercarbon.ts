import { getroBoard } from './getro';

// lowercarbon.com/get-off-the-couch proxies this getro network through the
// site's own wordpress api — which caps every query at its first hundred
// jobs, no paging. The fund's getro-hosted board still answers with the
// whole network, so the scraper reads that instead
export const board = getroBoard({ host: 'lowercarbon.getro.com', collectionId: 801 });
