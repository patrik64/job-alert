import { atsDetail } from './ats';
import { fetchJson } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Sentiero runs its board on Adde (adde.sentiero.vc), which serves the whole
// list as one json response. The board has no pages of its own per job or
// company — sentiero.vc/jobs embeds the list wholesale — so both links lead
// to the public board and descriptions come from the posting's applicant
// tracking system. The api's own description is a plain-text summary, not
// the posting.

const API = 'https://adde.sentiero.vc/api/public/jobs';
const BOARD = 'https://adde.sentiero.vc/public/jobs';

interface AddeJob {
	id?: string | null;
	title?: string | null;
	company?: { name?: string | null } | null;
	location?: string | null;
	url?: string | null;
	postedDate?: string | null;
}

export const board: JobBoardScraper = {
	async list() {
		const data = await fetchJson<{ jobs?: AddeJob[] }>(API);
		const jobs: ScrapedJob[] = [];
		for (const j of data.jobs ?? []) {
			if (!j.id) continue;
			jobs.push({
				key: j.id,
				company: j.company?.name ?? '',
				companyUrl: BOARD,
				title: j.title ?? '',
				url: BOARD,
				applyUrl: j.url ?? '',
				category: '',
				sector: '',
				location: (j.location ?? '').trim(),
				salary: null,
				postedAt: j.postedDate ? new Date(j.postedDate) : null
			});
		}
		if (jobs.length === 0) throw new Error(`${BOARD}: the board lists no jobs`);
		return jobs;
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
