import { Entity, Fields } from 'remult';

@Entity<Fund>('funds', {
	allowApiRead: true, // mutations only happen in backend code (ScrapeController)
	id: { slug: true },
	defaultOrderBy: { name: 'asc' }
})
export class Fund {
	@Fields.string()
	slug = '';

	@Fields.string()
	name = '';

	// jobs the board listed at the last successful fetch
	@Fields.integer()
	jobCount = 0;

	// newcomers found by the last successful fetch
	@Fields.integer()
	newCount = 0;

	@Fields.date({ allowNull: true })
	lastFetchedAt?: Date;

	// '' = last fetch succeeded
	@Fields.string()
	lastError = '';

	// the first fetch of a fund imports a baseline: when it ran and how many
	// jobs it brought in — the timeline shows that import as one count rather
	// than as thousands of rows
	@Fields.date({ allowNull: true })
	baselineAt: Date | null = null;

	@Fields.integer()
	baselineCount = 0;
}
