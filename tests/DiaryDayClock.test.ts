import { describe, expect, it } from "vitest";
import { DiaryDayClock, isDayEnd } from "../src/domain/DiaryDayClock";

const at = (date: Date, dayEnd = "05:00") => new DiaryDayClock({ now: () => date }, () => dayEnd).now();

describe("DiaryDayClock", () => {
	it("keeps the date once the day has started", () => {
		expect(at(new Date(2026, 9, 7, 5, 0))).toEqual(new Date(2026, 9, 7, 5, 0));
		expect(at(new Date(2026, 9, 7, 23, 59))).toEqual(new Date(2026, 9, 7, 23, 59));
	});

	it("moves a night entry to the previous day and keeps its time", () => {
		expect(at(new Date(2026, 9, 7, 3, 0))).toEqual(new Date(2026, 9, 6, 3, 0));
		expect(at(new Date(2026, 9, 7, 4, 59))).toEqual(new Date(2026, 9, 6, 4, 59));
	});

	it("crosses month and year boundaries", () => {
		expect(at(new Date(2026, 9, 1, 1, 0))).toEqual(new Date(2026, 8, 30, 1, 0));
		expect(at(new Date(2027, 0, 1, 0, 30))).toEqual(new Date(2026, 11, 31, 0, 30));
	});

	it("honours minutes in the day end and midnight as no shift", () => {
		expect(at(new Date(2026, 9, 7, 2, 29), "02:30")).toEqual(new Date(2026, 9, 6, 2, 29));
		expect(at(new Date(2026, 9, 7, 2, 30), "02:30")).toEqual(new Date(2026, 9, 7, 2, 30));
		expect(at(new Date(2026, 9, 7, 0, 0), "00:00")).toEqual(new Date(2026, 9, 7, 0, 0));
	});

	it("falls back to 05:00 for a broken value", () => {
		expect(at(new Date(2026, 9, 7, 4, 0), "late")).toEqual(new Date(2026, 9, 6, 4, 0));
	});
});

describe("isDayEnd", () => {
	it("accepts only HH:mm", () => {
		expect(isDayEnd("05:00")).toBe(true);
		expect(isDayEnd("23:59")).toBe(true);
		expect(isDayEnd("5:00")).toBe(false);
		expect(isDayEnd("24:00")).toBe(false);
		expect(isDayEnd(5)).toBe(false);
	});
});
