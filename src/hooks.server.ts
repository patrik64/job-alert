import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { api } from './server/api';

// the entity reads under /api change once a night; letting the cdn hold them
// for an hour spares the database the same rows over and over (a deploy
// clears the cache). The backend methods are posts and admin only exists in
// dev, so neither is caught
const cacheApiReads: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (!dev && event.request.method === 'GET' && event.url.pathname.startsWith('/api/') && response.ok)
		response.headers.set('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
	return response;
};

export const handle: Handle = sequence(cacheApiReads, api);
