import { describe, expect, it } from "vitest";
import { findTokenAtCursor, replaceToken } from "../src/domain/CaptureToken";

const at = (text: string) => findTokenAtCursor(text, text.length);

describe("findTokenAtCursor", () => {
	it("finds a tag after whitespace or at start", () => {
		expect(at("buy #gro")).toEqual({ kind: "tag", query: "gro", start: 4, end: 8 });
		expect(at("#")).toEqual({ kind: "tag", query: "", start: 0, end: 1 });
	});

	it("ignores # inside a word", () => {
		expect(at("learn C#")).toBeNull();
		expect(at("site.com/page#top")).toBeNull();
	});

	it("finds an unfinished link", () => {
		expect(at("see [[Proj")).toEqual({ kind: "link", query: "Proj", start: 4, end: 10 });
		expect(at("[[")).toEqual({ kind: "link", query: "", start: 0, end: 2 });
	});

	it("ignores closed links and links across lines", () => {
		expect(at("[[Done]] and")).toBeNull();
		expect(at("[[a\nb")).toBeNull();
	});

	it("returns null for plain text and tags ended by space", () => {
		expect(at("hello")).toBeNull();
		expect(at("#tag ")).toBeNull();
	});

	it("uses the cursor, not the end of text", () => {
		expect(findTokenAtCursor("#ab rest", 3)).toEqual({ kind: "tag", query: "ab", start: 0, end: 3 });
	});
});

describe("replaceToken", () => {
	it("replaces the token and places the cursor after a trailing space", () => {
		const text = "see [[Pro rest";
		const token = findTokenAtCursor(text, 9)!;
		expect(replaceToken(text, token, "[[Project]]")).toEqual({ text: "see [[Project]]  rest", cursor: 16 });
	});
});
