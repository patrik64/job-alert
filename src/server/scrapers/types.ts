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
	// the job's detail when the board keeps it on a page of its own; null when
	// the job is gone. Absent for boards that publish no detail at all.
	detail?(job: { url: string }): Promise<ScrapedJobDetail | null>;
}
