export type SegmentKind = "plain" | "tag" | "link";

export interface Segment {
	kind: SegmentKind;
	text: string;
}

const TOKENS = /\[\[[^\]\n]+\]\]|\[[^\]\n]*\]\([^)\n]+\)|(?<=^|\s)#[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*/gu;

export function highlightSegments(text: string): Segment[] {
	const segments: Segment[] = [];
	let cursor = 0;
	for (const match of text.matchAll(TOKENS)) {
		const start = match.index ?? 0;
		if (start > cursor) segments.push({ kind: "plain", text: text.slice(cursor, start) });
		segments.push({ kind: match[0].startsWith("#") ? "tag" : "link", text: match[0] });
		cursor = start + match[0].length;
	}
	if (cursor < text.length) segments.push({ kind: "plain", text: text.slice(cursor) });
	return segments;
}
