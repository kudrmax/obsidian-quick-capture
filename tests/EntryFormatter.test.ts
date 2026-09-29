import { describe, expect, it } from "vitest";
import { EntryFormatter } from "../src/domain/EntryFormatter";

const clock = { now: () => new Date(2026, 8, 29, 23, 5) };
const formatter = new EntryFormatter(clock);

describe("EntryFormatter", () => {
	it("wraps content with prefix and suffix", () => {
		expect(formatter.format({ prefix: "- ", suffix: " #inbox" }, "milk")).toBe("- milk #inbox");
	});

	it("replaces every {{time}} with zero-padded HH:mm", () => {
		expect(formatter.format({ prefix: "- {{time}} ", suffix: " ({{time}})" }, "x")).toBe("- 23:05 x (23:05)");
	});

	it("keeps other placeholders and replacement patterns literally", () => {
		expect(formatter.format({ prefix: "{{date}} ", suffix: "" }, "cost $& and $1")).toBe("{{date}} cost $& and $1");
	});

	it("keeps multiline content as is", () => {
		expect(formatter.format({ prefix: "- ", suffix: " #t" }, "a\nb")).toBe("- a\nb #t");
	});

	it("puts tags between the content and the suffix", () => {
		expect(formatter.format({ prefix: "- ", suffix: " #transcribe" }, "[[a.m4a]]", ["#idea", "#book/quote"])).toBe(
			"- [[a.m4a]] #idea #book/quote #transcribe",
		);
	});

	it("adds a missing # to a tag and skips blank and repeated tags", () => {
		expect(formatter.format({ prefix: "", suffix: "" }, "x", ["idea", " ", "#idea", " #todo "])).toBe("x #idea #todo");
	});

	it("puts tags at the end of the last line of multiline content", () => {
		expect(formatter.format({ prefix: "- ", suffix: "" }, "a\nb", ["#t"])).toBe("- a\nb #t");
	});
});
