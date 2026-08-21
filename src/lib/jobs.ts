import { formatSalary, type SalaryFields } from './salary';

// the small print next to a job's title: function, place and pay — whatever is known
export function jobMeta(job: SalaryFields & { category: string; location: string }): string {
	return [job.category, job.location, formatSalary(job)].filter(Boolean).join(' · ');
}
