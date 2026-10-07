import type { RequestEvent } from '@sveltejs/kit';
import { repo } from 'remult';
import { api } from '../../server/api';
import { StatisticsRow } from '../../shared/StatisticsRow';

// GET /statistics.json — the stored summary of the statistics ledger: every
// month's numbers as the statistics page draws them (see server/statistics.ts)
export const GET = (event: RequestEvent) =>
	api.withRemult(event, async () => {
		const stored = await repo(StatisticsRow).findId('summary', { useCache: false });
		// a database the nightly run has not counted yet has nothing to show
		if (!stored)
			return new Response(JSON.stringify({ computedAt: null, months: [] }), {
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
					'Cache-Control': 'public, max-age=0, s-maxage=60'
				}
			});
		return new Response(stored.json, {
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				// the numbers change once a night; the cdn holds them for an hour
				// and serves them a while longer while fetching fresh ones
				'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
			}
		});
	});
