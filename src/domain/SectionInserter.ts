interface Heading {
	line: number;
	level: number;
	text: string;
}

const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const FENCE = /^[ \t]*(```|~~~)/;

export function insertIntoSection(note: string, heading: string, entry: string): string {
	const separator = note.includes("\r\n") ? "\r\n" : "\n";
	const lines = note.split(/\r?\n/);
	const entryLines = entry.split(/\r?\n/);
	const target = heading.trim().toLowerCase();
	const headings = findHeadings(lines);
	const match = target === "" ? undefined : headings.find((h) => h.text.trim().toLowerCase() === target);

	if (!match) return appendToEnd(note, lines, entryLines, separator);

	const next = headings.find((h) => h.line > match.line && h.level <= match.level);
	const sectionEnd = next ? next.line : lines.length;
	let insertAt = match.line + 1;
	for (let i = sectionEnd - 1; i > match.line; i--) {
		if (lines[i].trim() !== "") {
			insertAt = i + 1;
			break;
		}
	}
	lines.splice(insertAt, 0, ...entryLines);
	return lines.join(separator);
}

function appendToEnd(note: string, lines: string[], entryLines: string[], separator: string): string {
	if (note === "") return entryLines.join(separator);
	const endsWithNewline = lines[lines.length - 1] === "";
	if (endsWithNewline) lines.splice(lines.length - 1, 0, ...entryLines);
	else lines.push(...entryLines);
	return lines.join(separator);
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
	if (lines[0] !== "---") return 0;
	const end = lines.indexOf("---", 1);
	return end === -1 ? 0 : end + 1;
}
