import { Entity, Fields } from 'remult';

// remult takes a plain null in a filter to mean "is null", but its filter
// typing has no room for one on a nullable date — this is that null, typed
// to get past the checker (values written with `set` stay a real null)
export const NULL_DATE = null as never;

@Entity<Job>('jobs', {
	allowApiRead: true, // mutations only happen in backend code (ScrapeController)
	defaultOrderBy: { company: 'asc', title: 'asc' }
})
export class Job {
	// deterministic `${fundSlug}:${key}`, key being the board's own stable job
	// id — makes inserts idempotent across fetches
	@Fields.string()
	id = '';

	@Fields.string()
	fundSlug = '';

	@Fields.string()
	company = '';

	// the company's page on the fund's job board
	@Fields.string()
	companyUrl = '';

	@Fields.string()
	title = '';

	// the job's page on the fund's job board (a board without per-job pages
	// points at the company's page there instead)
	@Fields.string()
	url = '';

	// the posting itself, on the company's applicant tracking system
	@Fields.string()
	applyUrl = '';

	// job function(s) as the board files them, comma-joined
	@Fields.string()
	category = '';

	// the company's industry tags, comma-joined
	@Fields.string()
	sector = '';

	@Fields.string()
	location = '';

	// whole currency units; null when the board publishes no figure
	@Fields.number({ allowNull: true })
	salaryMin: number | null = null;

	@Fields.number({ allowNull: true })
	salaryMax: number | null = null;

	@Fields.string()
	salaryCurrency = '';

	// 'year' | 'hour' | 'month' | 'week' | 'day' | '' (unknown)
	@Fields.string()
	salaryPeriod = '';

	// when the board says the job was posted (firstSeenAt is when we saw it)
	@Fields.date({ allowNull: true })
	postedAt: Date | null = null;

	// set when a fetch finds a job that wasn't in the database; cleared on the
	// fund's next successful fetch. (Named isNewcomer because remult's type
	// helpers reserve every EntityBase member name, including isNew.)
	@Fields.boolean()
	isNewcomer = false;

	// inserted by the fund's first fetch, its baseline import
	@Fields.boolean()
	baseline = false;

	@Fields.createdAt()
	firstSeenAt?: Date;

	// when the job's detail (description, functions) was fetched; null while
	// that is still pending
	@Fields.date({ allowNull: true })
	enrichedAt: Date | null = null;
}
