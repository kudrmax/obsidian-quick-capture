import { describe, expect, it } from "vitest";
import { MAX_PART_BYTES, PartSizeBudget, partFileNames, partOffsets } from "../src/domain/RecordingParts";

describe("partFileNames", () => {
	it("keeps a single part under the plain name", () => {
		expect(partFileNames("Recording 1", "m4a", 1)).toEqual(["Recording 1.m4a"]);
	});

	it("numbers every part of a split recording", () => {
		expect(partFileNames("Recording 1", "m4a", 3)).toEqual(["Recording 1 (1).m4a", "Recording 1 (2).m4a", "Recording 1 (3).m4a"]);
	});
});

describe("partOffsets", () => {
	it("starts each part where the previous ones end", () => {
		expect(partOffsets([1000, 2500, 300])).toEqual([0, 1000, 3500]);
	});
});

describe("PartSizeBudget", () => {
	it("leaves room below Obsidian Sync's 5 MB file limit", () => {
		expect(MAX_PART_BYTES).toBeLessThan(5 * 1024 * 1024);
	});

	it("fills up once the chunks reach the limit", () => {
		const budget = new PartSizeBudget(100);
		budget.add(60);
		expect(budget.isFull()).toBe(false);
		budget.add(40);
		expect(budget.isFull()).toBe(true);
	});

	it("starts empty again for the next part", () => {
		const budget = new PartSizeBudget(100);
		budget.add(150);
		budget.reset();
		expect(budget.isFull()).toBe(false);
	});
});
