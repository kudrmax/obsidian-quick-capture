import { describe, expect, it } from "vitest";
import { insertEntry, insertIntoSection, parseHeading } from "../src/domain/SectionInserter";

const ins = (note: string, heading: string, entry: string, level = 2) =>
	insertIntoSection(note, parseHeading(heading, level), entry);

describe("insertIntoSection", () => {
	it("appends to the end of the matched section before the next same-level heading", () => {
		const note = "# Day\n## Journal\n- a\n\n## Tasks\n- t\n";
		expect(ins(note, "journal", "- b")).toBe("# Day\n## Journal\n- a\n- b\n\n## Tasks\n- t\n");
	});

	it("keeps deeper headings inside the section", () => {
		const note = "## Journal\n### Morning\n- m\n## Tasks\n";
		expect(ins(note, "Journal", "- e")).toBe("## Journal\n### Morning\n- m\n- e\n## Tasks\n");
	});

	it("puts the first entry of an empty section after the blank line that follows the heading", () => {
		expect(ins("## Journal\n\n## Tasks\n", "Journal", "- e")).toBe("## Journal\n\n- e\n## Tasks\n");
	});

	it("adds a blank line before the first entry of an empty section", () => {
		expect(ins("## Journal\n## Tasks\n", "Journal", "- e")).toBe("## Journal\n\n- e\n## Tasks\n");
		expect(ins("## Journal", "Journal", "- e")).toBe("## Journal\n\n- e");
	});

	it("extends a section that runs to the end of file", () => {
		expect(ins("## Journal\n- a", "Journal", "- b")).toBe("## Journal\n- a\n- b");
	});

	it("creates a missing heading at the end of the note, separated by a blank line", () => {
		expect(ins("text\n", "Journal", "- b")).toBe("text\n\n## Journal\n\n- b\n");
		expect(ins("text", "Journal", "- b")).toBe("text\n\n## Journal\n\n- b");
		expect(ins("text\n\n", "Journal", "- b")).toBe("text\n\n## Journal\n\n- b\n");
	});

	it("creates the missing heading with the level written in the setting", () => {
		expect(ins("- task\n", "### Дневник", "- b")).toBe("- task\n\n### Дневник\n\n- b\n");
	});

	it("creates the missing heading with the given level", () => {
		expect(ins("- task\n", "Дневник", "- b", 3)).toBe("- task\n\n### Дневник\n\n- b\n");
	});

	it("finds an existing heading regardless of the level in the setting", () => {
		expect(ins("### Дневник\n- a\n", "## дневник", "- b")).toBe("### Дневник\n- a\n- b\n");
	});

	it("appends to the end of the note when heading setting is empty", () => {
		expect(ins("## Journal\n- a\n## Tasks\n", "  ", "- b")).toBe("## Journal\n- a\n## Tasks\n- b\n");
	});

	it("writes into an empty note", () => {
		expect(ins("", "", "- b")).toBe("- b");
		expect(ins("", "Journal", "- b")).toBe("## Journal\n\n- b");
	});

	it("ignores headings inside frontmatter and code fences", () => {
		const note = "---\n# Journal: yaml comment\n---\n```\n# Journal\n```\n## Journal\n- a\n";
		expect(ins(note, "Journal", "- b")).toBe(note.replace("- a\n", "- a\n- b\n"));
	});

	it("matches headings with closing hashes and extra spaces", () => {
		expect(ins("##   Journal  ##\n- a\n", "Journal", "- b")).toBe("##   Journal  ##\n- a\n- b\n");
	});

	it("preserves CRLF line endings", () => {
		expect(ins("## Journal\r\n- a\r\n## T\r\n", "Journal", "- b\nc")).toBe("## Journal\r\n- a\r\n- b\r\nc\r\n## T\r\n");
	});

	it("inserts multiline entries and replacement patterns literally", () => {
		expect(ins("## Journal\n", "Journal", "- $& x\ny")).toBe("## Journal\n\n- $& x\ny\n");
	});

	it("accepts a heading setting written with leading hashes", () => {
		expect(ins("## Journal\n- a\n## T\n", "## Journal", "- b")).toBe("## Journal\n- a\n- b\n## T\n");
	});

	it("keeps each existing line ending in notes with mixed line endings", () => {
		expect(ins("a\r\n## Journal\n- x\n", "Journal", "- y")).toBe("a\r\n## Journal\n- x\n- y\n");
	});

	it("recognizes frontmatter behind a byte order mark", () => {
		const note = "\uFEFF---\n# Journal\n---\n## Journal\n- a\n## Other\n- o\n";
		expect(ins(note, "Journal", "- b")).toBe(note.replace("- a\n", "- a\n- b\n"));
	});

	it("keeps a trailing hash that is part of the heading text", () => {
		expect(ins("## C#\n- a\n## T\n", "C#", "- b")).toBe("## C#\n- a\n- b\n## T\n");
	});
});

describe("insertEntry", () => {
	const lastEntryLine = (note: string, heading: string, entry: string) => {
		const { content, line } = insertEntry(note, parseHeading(heading, 2), entry);
		return { line, text: content.split(/\r?\n/)[line] };
	};

	it("points at the entry inside a matched section", () => {
		expect(lastEntryLine("# Day\n## Journal\n- a\n\n## Tasks\n", "Journal", "- b")).toEqual({ line: 3, text: "- b" });
	});

	it("points at the entry under a heading it created", () => {
		expect(lastEntryLine("text\n", "Journal", "- b")).toEqual({ line: 4, text: "- b" });
	});

	it("points at the entry in an empty section", () => {
		expect(lastEntryLine("## Journal\n## Tasks\n", "Journal", "- e")).toEqual({ line: 2, text: "- e" });
	});

	it("points at the entry in an empty note", () => {
		expect(lastEntryLine("", "Journal", "- b")).toEqual({ line: 2, text: "- b" });
		expect(lastEntryLine("", "", "- b")).toEqual({ line: 0, text: "- b" });
	});

	it("points at the last line of a multiline entry", () => {
		expect(lastEntryLine("- a\r\n", "", "- b\nmore")).toEqual({ line: 2, text: "more" });
	});

	it("gives the same content as insertIntoSection", () => {
		const note = "## Journal\n- a\n## Tasks\n";
		expect(insertEntry(note, parseHeading("Journal", 2), "- b").content).toBe(ins(note, "Journal", "- b"));
	});
});

describe("parseHeading", () => {
	it("takes the level from leading hashes", () => {
		expect(parseHeading("### Дневник", 2)).toEqual({ text: "Дневник", level: 3 });
	});

	it("uses the fallback level without hashes", () => {
		expect(parseHeading(" Дневник ", 4)).toEqual({ text: "Дневник", level: 4 });
	});

	it("returns null for a blank heading", () => {
		expect(parseHeading("  ", 2)).toBeNull();
		expect(parseHeading("##", 2)).toBeNull();
	});
});
