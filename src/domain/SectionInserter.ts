interface Heading {
	line: number;
	level: number;
	text: string;
}

interface SplitNote {
	lines: string[];
	separators: string[];
}

const HEADING = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^[ \t]*(```|~~~)/;
const BYTE_ORDER_MARK = "\uFEFF";

export interface HeadingTarget {
	text: string;
	level: number;
}

export function parseHeading(heading: string, fallbackLevel: number): HeadingTarget | null {
	const match = /^\s*(#{1,6})?\s*(.*?)\s*$/.exec(heading);
	const text = match?.[2] ?? "";
	if (text === "") return null;
	return { text, level: match?.[1]?.length ?? fallbackLevel };
}

export function insertIntoSection(note: string, heading: HeadingTarget | null, entry: string): string {
	const entryLines = entry.split(/\r?\n/);
	const headingLines = heading ? [`${"#".repeat(heading.level)} ${heading.text}`, ""] : [];
	if (note === "") return [...headingLines, ...entryLines].join("\n");

	const { lines, separators } = splitNote(note);
	const headings = findHeadings(lines);
	const key = heading?.text.toLowerCase();
	const match = headings.find((h) => h.text.trim().toLowerCase() === key);
	if (match) return insertIntoMatchedSection(lines, separators, headings, match, entryLines);

	const insertAt = endInsertIndex(lines);
	if (!heading) return insertLines(lines, separators, insertAt, entryLines);
	const spacer = insertAt > 0 && lines[insertAt - 1].trim() !== "" ? [""] : [];
	return insertLines(lines, separators, insertAt, [...spacer, ...headingLines, ...entryLines]);
}

function insertIntoMatchedSection(
	lines: string[],
	separators: string[],
	headings: Heading[],
	match: Heading,
	entryLines: string[],
): string {
	const next = headings.find((h) => h.line > match.line && h.level <= match.level);
	const sectionEnd = next ? next.line : endInsertIndex(lines);
	for (let i = sectionEnd - 1; i > match.line; i--) {
		if (lines[i].trim() !== "") return insertLines(lines, separators, i + 1, entryLines);
	}
	const afterHeading = match.line + 1;
	if (afterHeading < sectionEnd) return insertLines(lines, separators, afterHeading + 1, entryLines);
	return insertLines(lines, separators, afterHeading, ["", ...entryLines]);
}

function insertLines(lines: string[], separators: string[], insertAt: number, inserted: string[]): string {
	const separator = separators[insertAt - 1] ?? separators[0] ?? "\n";
	lines.splice(insertAt, 0, ...inserted);
	separators.splice(insertAt, 0, ...inserted.map(() => separator));
	return joinNote(lines, separators);
}

function endInsertIndex(lines: string[]): number {
	return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

function splitNote(note: string): SplitNote {
	const parts = note.split(/(\r?\n)/);
	return {
		lines: parts.filter((_, index) => index % 2 === 0),
		separators: parts.filter((_, index) => index % 2 === 1),
	};
}

function joinNote(lines: string[], separators: string[]): string {
	return lines.map((line, index) => line + (separators[index] ?? "")).join("");
}

function findHeadings(lines: string[]): Heading[] {
	const headings: Heading[] = [];
	let fence: string | null = null;
	for (let index = skipFrontmatter(lines); index < lines.length; index++) {
		const line = lines[index];
		const fenceMatch = FENCE.exec(line);
		if (fenceMatch) {
			if (fence === null) fence = fenceMatch[1];
			else if (fenceMatch[1] === fence) fence = null;
			continue;
		}
		if (fence !== null) continue;
		const match = HEADING.exec(line);
		if (match) headings.push({ line: index, level: match[1].length, text: match[2] });
	}
	return headings;
}

function skipFrontmatter(lines: string[]): number {
	const first = lines[0]?.startsWith(BYTE_ORDER_MARK) ? lines[0].slice(1) : lines[0];
	if (first !== "---") return 0;
	const end = lines.indexOf("---", 1);
	return end === -1 ? 0 : end + 1;
}
