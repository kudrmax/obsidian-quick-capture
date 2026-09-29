import { Clock } from "./Clock";

export interface EntryTemplate {
	prefix: string;
	suffix: string;
}

const TIME_PLACEHOLDER = "{{time}}";

export class EntryFormatter {
	constructor(private readonly clock: Clock) {}

	format(template: EntryTemplate, content: string, tags: readonly string[] = []): string {
		const time = this.currentTime();
		const expand = (part: string) => part.split(TIME_PLACEHOLDER).join(time);
		const tagPart = normalizeTags(tags).map((tag) => ` ${tag}`).join("");
		return expand(template.prefix) + content + tagPart + expand(template.suffix);
	}

	private currentTime(): string {
		const now = this.clock.now();
		return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
	}
}

function normalizeTags(tags: readonly string[]): string[] {
	const names = tags.map((tag) => tag.trim().replace(/^#+/, "")).filter((name) => name !== "");
	return [...new Set(names)].map((name) => `#${name}`);
}
