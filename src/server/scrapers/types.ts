export interface ScrapedSalary {
	// whole currency units; null when that end of the range is not published
	min: number | null;
	max: number | null;
	currency: string;
	// 'year' | 'hour' | 'month' | 'week' | 'day' | '' (unknown)
	period: string;
}

export interface ScrapedJob {
	// the board's own stable id for the job, unique within the board
	key: string;
	company: string;
	// the company's page on the board
	companyUrl: string;
	title: string;
	// the job's page on the board (the company's page when the board has none)
	url: string;
	// the posting on the company's applicant tracking system
	applyUrl: string;
	// job function(s), comma-joined ('' when only the detail carries them)
	category: string;
	// the company's industry tags, comma-joined
	sector: string;
	location: string;
	salary: ScrapedSalary | null;
	postedAt: Date | null;
}

export interface ScrapedJobDetail {
	// html as delivered by the board
	description: string;
	category?: string;
	postedAt?: Date | null;
}

export interface JobBoardScraper {
	// every job the board currently lists
	list(): Promise<ScrapedJob[]>;
	// the job's detail — from its page on the board, or from the posting on
	// the company's applicant tracking system when the board has none; null
	// when there is nothing to be had. Absent for boards without either.
	detail?(job: { url: string; applyUrl: string }): Promise<ScrapedJobDetail | null>;
}
