import { getroApiBoard } from './getro';

// paleblue.vc/jobs renders getro's data into the fund's own site, which sits
// behind a challenge no scraper passes — but the network (its retired hosted
// board was jobs.paleblue.vc, collection 1110) still answers on the api
export const board = getroApiBoard({ collectionId: 1110, jobsPage: 'https://paleblue.vc/jobs' });
