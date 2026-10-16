import { Clock } from "./Clock";

export const DEFAULT_DAY_END = "05:00";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTES_PER_HOUR = 60;

export function isDayEnd(value: unknown): value is string {
	return typeof value === "string" && TIME_PATTERN.test(value);
}

function minutesOf(dayEnd: string): number {
	const match = TIME_PATTERN.exec(dayEnd) ?? TIME_PATTERN.exec(DEFAULT_DAY_END)!;
	return Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}

export function daysBefore(date: Date, days: number): Date {
	const earlier = new Date(date);
	earlier.setDate(date.getDate() - days);
	return earlier;
}

export class DiaryDayClock implements Clock {
	constructor(
		private readonly clock: Clock,
		private readonly dayEnd: () => string,
	) {}

	now(): Date {
		const now = this.clock.now();
		if (now.getHours() * MINUTES_PER_HOUR + now.getMinutes() >= minutesOf(this.dayEnd())) return now;
		return daysBefore(now, 1);
	}
}
