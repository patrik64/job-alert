import { api } from '../../../server/api';

// vercel's hobby plan kills a function at 300 seconds and rejects any higher
// maxDuration at build time — the biggest board's fetch has to fit, and the
// nightly script retries the ones that don't
export const { GET, POST, PUT, DELETE } = api;
