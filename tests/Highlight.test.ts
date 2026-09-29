import { describe, expect, it } from "vitest";
import { highlightSegments } from "../src/domain/Highlight";

describe("highlightSegments", () => {
	it("marks tags that start a word", () => {
		expect(highlightSegments("buy #milk now")).toEqual([
			{ kind: "plain", text: "buy " },
			{ kind: "tag", text: "#milk" },
			{ kind: "plain", text: " now" },
		]);
	});

	it("ignores # inside words and numeric-only tags", () => {
		expect(highlightSegments("C# #123 #2026x")).toEqual([
			{ kind: "plain", text: "C# #123 " },
			{ kind: "tag", text: "#2026x" },
		]);
	});

	it("stops a tag at punctuation and supports nested tags and unicode", () => {
		expect(highlightSegments("#проект/дом, ok")).toEqual([
			{ kind: "tag", text: "#проект/дом" },
			{ kind: "plain", text: ", ok" },
		]);
	});

	it("marks wiki links and markdown links", () => {
		expect(highlightSegments("see [[Note|alias]] and [x](y.md)")).toEqual([
			{ kind: "plain", text: "see " },
			{ kind: "link", text: "[[Note|alias]]" },
			{ kind: "plain", text: " and " },
			{ kind: "link", text: "[x](y.md)" },
		]);
	});

	it("leaves unfinished links plain and keeps line breaks", () => {
		expect(highlightSegments("a [[Draft\n#t")).toEqual([
			{ kind: "plain", text: "a [[Draft\n" },
			{ kind: "tag", text: "#t" },
		]);
	});

	it("returns nothing for empty text", () => {
		expect(highlightSegments("")).toEqual([]);
	});
});
