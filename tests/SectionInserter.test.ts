import { describe, expect, it } from "vitest";
import { insertIntoSection } from "../src/domain/SectionInserter";

describe("insertIntoSection", () => {
	it("appends to the end of the matched section before the next same-level heading", () => {
		const note = "# Day\n## Journal\n- a\n\n## Tasks\n- t\n";
		expect(insertIntoSection(note, "journal", "- b")).toBe("# Day\n## Journal\n- a\n- b\n\n## Tasks\n- t\n");
	});

	it("keeps deeper headings inside the section", () => {
		const note = "## Journal\n### Morning\n- m\n## Tasks\n";
		expect(insertIntoSection(note, "Journal", "- e")).toBe("## Journal\n### Morning\n- m\n- e\n## Tasks\n");
	});

	it("inserts right after an empty section heading", () => {
		expect(insertIntoSection("## Journal\n\n## Tasks\n", "Journal", "- e")).toBe("## Journal\n- e\n\n## Tasks\n");
	});

	it("extends a section that runs to the end of file", () => {
		expect(insertIntoSection("## Journal\n- a", "Journal", "- b")).toBe("## Journal\n- a\n- b");
	});

	it("appends to the end of the note when the heading is missing", () => {
		expect(insertIntoSection("text\n", "Journal", "- b")).toBe("text\n- b\n");
		expect(insertIntoSection("text", "Journal", "- b")).toBe("text\n- b");
	});

	it("appends to the end of the note when heading setting is empty", () => {
		expect(insertIntoSection("## Journal\n- a\n## Tasks\n", "  ", "- b")).toBe("## Journal\n- a\n## Tasks\n- b\n");
	});

	it("writes into an empty note", () => {
		expect(insertIntoSection("", "Journal", "- b")).toBe("- b");
	});

	it("ignores headings inside frontmatter and code fences", () => {
		const note = "---\n# Journal: yaml comment\n---\n```\n# Journal\n```\n## Journal\n- a\n";
		expect(insertIntoSection(note, "Journal", "- b")).toBe(note.replace("- a\n", "- a\n- b\n"));
	});

	it("matches headings with closing hashes and extra spaces", () => {
		expect(insertIntoSection("##   Journal  ##\n- a\n", "Journal", "- b")).toBe("##   Journal  ##\n- a\n- b\n");
	});

	it("preserves CRLF line endings", () => {
		expect(insertIntoSection("## Journal\r\n- a\r\n## T\r\n", "Journal", "- b\nc")).toBe("## Journal\r\n- a\r\n- b\r\nc\r\n## T\r\n");
	});

	it("inserts multiline entries and replacement patterns literally", () => {
		expect(insertIntoSection("## Journal\n", "Journal", "- $& x\ny")).toBe("## Journal\n- $& x\ny\n");
	});

	it("accepts a heading setting written with leading hashes", () => {
		expect(insertIntoSection("## Journal\n- a\n## T\n", "## Journal", "- b")).toBe("## Journal\n- a\n- b\n## T\n");
	});

	it("keeps each existing line ending in notes with mixed line endings", () => {
		expect(insertIntoSection("a\r\n## Journal\n- x\n", "Journal", "- y")).toBe("a\r\n## Journal\n- x\n- y\n");
	});

	it("recognizes frontmatter behind a byte order mark", () => {
		const note = "\uFEFF---\n# Journal\n---\n## Journal\n- a\n## Other\n- o\n";
		expect(insertIntoSection(note, "Journal", "- b")).toBe(note.replace("- a\n", "- a\n- b\n"));
	});

	it("keeps a trailing hash that is part of the heading text", () => {
		expect(insertIntoSection("## C#\n- a\n## T\n", "C#", "- b")).toBe("## C#\n- a\n- b\n## T\n");
	});
});
