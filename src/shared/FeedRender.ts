import { Entity, Fields } from 'remult';

// one stored rendering per rss feed: the nightly run writes them once the
// boards are refreshed, and the feed routes serve these rows instead of
// reading the whole newcomer window on every request — the reads were most
// of the database's egress (see server/feeds.ts)
@Entity<FeedRender>('feed_renders', {
	// served by the feed routes only; nothing to read over the api
	allowApiRead: false
})
export class FeedRender {
	// the route's slug, e.g. rss-rust
	@Fields.string()
	id = '';

	@Fields.string()
	xml = '';

	@Fields.date()
	renderedAt = new Date();
}
