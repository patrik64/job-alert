import { api } from '../../../server/api';

// vercel kills a function at 300 seconds by default — not enough for the
// biggest board's fetch (accel lists ~25k jobs), which then dies before it
// can even record its error. 800 is as high as the platform allows.
export const config = { maxDuration: 800 };

export const { GET, POST, PUT, DELETE } = api;
