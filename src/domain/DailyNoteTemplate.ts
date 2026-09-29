export type DateFormatter = (date: Date, format: string) => string;

const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
const DEFAULT_TIME_FORMAT = "HH:mm";

export function dailyNotePath(folder: string, format: string, date: Date, formatDate: DateFormatter): string {
	const name = formatDate(date, format.trim() || DEFAULT_DATE_FORMAT);
	const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, "");
	return cleanFolder ? `${cleanFolder}/${name}.md` : `${name}.md`;
}

export function renderDailyTemplate(
	template: string,
	title: string,
	date: Date,
	formatDate: DateFormatter,
	dateFormat: string,
): string {
	return template
		.replace(/{{\s*title\s*}}/gi, () => title)
		.replace(/{{\s*(date|time)\s*(?::(.*?))?\s*}}/gi, (_match, kind: string, format?: string) => {
			const fallback = kind.toLowerCase() === "date" ? dateFormat.trim() || DEFAULT_DATE_FORMAT : DEFAULT_TIME_FORMAT;
			return formatDate(date, format?.trim() || fallback);
		});
}
