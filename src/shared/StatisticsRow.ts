import { Entity, Fields } from 'remult';

// the statistics ledger: one row a day with that night's newcomers counted
// (see server/statistics.ts), written by the nightly run once the boards are
// refreshed and the feeds rendered, and one row — 'summary' — with every
// month's numbers summed from the days, which is what the statistics page
// reads. Jobs leave the database with their boards, so a night's counts are
// kept here as they stood rather than recounted later from whatever of the
// night is still listed
@Entity<StatisticsRow>('statistics', {
	// served by the statistics route only; nothing to read over the api
	allowApiRead: false
})
export class StatisticsRow {
	// a day as YYYY-MM-DD in the nightly run's timezone (see rss.ts), or
	// 'summary'
	@Fields.string()
	id = '';

	// the counts as json — a DayCounts, or the Statistics of the summary
	@Fields.string()
	json = '';

	@Fields.date()
	computedAt = new Date();

	// counted the night it happened, or the one after, rather than rebuilt
	// later from the jobs still listed — which the night's departed jobs are
	// missing from
	@Fields.boolean()
	complete = false;
}
