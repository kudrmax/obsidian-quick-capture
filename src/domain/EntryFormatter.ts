import { Clock } from "./Clock";

export interface EntryTemplate {
	prefix: string;
	suffix: string;
}

const TIME_PLACEHOLDER = "{{time}}";
const DATE_PLACEHOLDER = "{{date}}";

export class EntryFormatter {
	constructor(private readonly clock: Clock) {}

	format(template: EntryTemplate, content: string, tags: readonly string[] = []): string {
		const now = this.clock.now();
		const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
		const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
		const expand = (part: string) => part.split(TIME_PLACEHOLDER).join(time).split(DATE_PLACEHOLDER).join(date);
		const tagPart = normalizeTags(tags).map((tag) => ` ${tag}`).join("");
		return expand(template.prefix) + content + tagPart + expand(template.suffix);
	}
}

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

function normalizeTags(tags: readonly string[]): string[] {
	const names = tags.map((tag) => tag.trim().replace(/^#+/, "")).filter((name) => name !== "");
	return [...new Set(names)].map((name) => `#${name}`);
}
