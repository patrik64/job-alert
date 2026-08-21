// one line for a job's pay — "$160,000–$194,000 / year", "from $80 / hour",
// "up to €120,000 / year" — or '' when the board published no figure
const PERIOD: Record<string, string> = {
	year: '/ year',
	hour: '/ hour',
	month: '/ month',
	week: '/ week',
	day: '/ day'
};

export interface SalaryFields {
	salaryMin: number | null;
	salaryMax: number | null;
	salaryCurrency: string;
	salaryPeriod: string;
}

export function formatSalary({ salaryMin, salaryMax, salaryCurrency, salaryPeriod }: SalaryFields) {
	if (salaryMin == null && salaryMax == null) return '';
	const money = (n: number) => {
		// hourly rates carry cents, yearly figures do not
		const digits = n % 1 ? 2 : 0;
		if (salaryCurrency) {
			try {
				return new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: salaryCurrency,
					maximumFractionDigits: digits
				}).format(n);
			} catch {
				// not a currency code Intl knows — fall through to a plain number
			}
		}
		const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);
		return salaryCurrency ? `${salaryCurrency} ${plain}` : plain;
	};
	const range =
		salaryMin != null && salaryMax != null
			? salaryMin === salaryMax
				? money(salaryMin)
				: `${money(salaryMin)}–${money(salaryMax)}`
			: salaryMin != null
				? `from ${money(salaryMin)}`
				: `up to ${money(salaryMax as number)}`;
	const suffix = PERIOD[salaryPeriod] ?? '';
	return suffix ? `${range} ${suffix}` : range;
}
