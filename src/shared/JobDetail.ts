import { Entity, Fields } from 'remult';

// the heavy part of a job, kept apart so that listing and diffing jobs never
// drags thousands of descriptions along — one row per job, under the job's id
@Entity<JobDetail>('job_details', {
	allowApiRead: true // mutations only happen in backend code (ScrapeController)
})
export class JobDetail {
	@Fields.string()
	id = '';

	// the description as the board delivers it — html, or markdown on some
	// boards; sanitize before rendering
	@Fields.string()
	description = '';
}
