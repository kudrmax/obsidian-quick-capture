export class TFile {
	constructor(readonly path: string) {}
}

export function normalizePath(path: string): string {
	return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

const pad = (value: number) => String(value).padStart(2, "0");

export function moment(date: Date) {
	return {
		format: (format: string) =>
			format
				.replaceAll("YYYY", String(date.getFullYear()))
				.replaceAll("MM", pad(date.getMonth() + 1))
				.replaceAll("DD", pad(date.getDate()))
				.replaceAll("HH", pad(date.getHours()))
				.replaceAll("mm", pad(date.getMinutes())),
	};
}
