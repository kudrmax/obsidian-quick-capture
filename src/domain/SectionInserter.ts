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
const DEFAULT_HEADING_MARK = "##";

export function insertIntoSection(note: string, heading: string, entry: string): string {
	const target = parseHeadingSetting(heading);
	const entryLines = entry.split(/\r?\n/);
	if (note === "") return (target ? [target.line, ...entryLines] : entryLines).join("\n");

	const { lines, separators } = splitNote(note);
	const headings = findHeadings(lines);
	const match = target ? headings.find((h) => h.text.trim().toLowerCase() === target.key) : undefined;
	if (match) return insertLines(lines, separators, sectionInsertIndex(lines, headings, match), entryLines);

	const insertAt = endInsertIndex(lines);
	if (!target) return insertLines(lines, separators, insertAt, entryLines);
	const spacer = insertAt > 0 && lines[insertAt - 1].trim() !== "" ? [""] : [];
	return insertLines(lines, separators, insertAt, [...spacer, target.line, ...entryLines]);
}

interface HeadingSetting {
	key: string;
	line: string;
}

function parseHeadingSetting(heading: string): HeadingSetting | null {
	const match = /^\s*(#{1,6})?\s*(.*?)\s*$/.exec(heading);
	const text = match?.[2] ?? "";
	if (text === "") return null;
	return { key: text.toLowerCase(), line: `${match?.[1] ?? DEFAULT_HEADING_MARK} ${text}` };
}

function insertLines(lines: string[], separators: string[], insertAt: number, inserted: string[]): string {
	const separator = separators[insertAt - 1] ?? separators[0] ?? "\n";
	lines.splice(insertAt, 0, ...inserted);
	separators.splice(insertAt, 0, ...inserted.map(() => separator));
	return joinNote(lines, separators);
}

function sectionInsertIndex(lines: string[], headings: Heading[], match: Heading): number {
	const next = headings.find((h) => h.line > match.line && h.level <= match.level);
	const sectionEnd = next ? next.line : lines.length;
	for (let i = sectionEnd - 1; i > match.line; i--) {
		if (lines[i].trim() !== "") return i + 1;
	}
	return match.line + 1;
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
