import { Clock } from "./Clock";

export interface EntryTemplate {
	prefix: string;
	suffix: string;
}

const TIME_PLACEHOLDER = "{{time}}";

export class EntryFormatter {
	constructor(private readonly clock: Clock) {}

	format(template: EntryTemplate, content: string): string {
		const time = this.currentTime();
		const expand = (part: string) => part.split(TIME_PLACEHOLDER).join(time);
		return expand(template.prefix) + content + expand(template.suffix);
	}

	private currentTime(): string {
		const now = this.clock.now();
		return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
	}
}
