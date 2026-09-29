export interface CaptureToken {
	kind: "tag" | "link";
	query: string;
	start: number;
	end: number;
}

export function findTokenAtCursor(text: string, cursor: number): CaptureToken | null {
	const before = text.slice(0, cursor);
	return findLink(before) ?? findTag(before);
}

export function replaceToken(text: string, token: CaptureToken, replacement: string): { text: string; cursor: number } {
	const inserted = `${replacement} `;
	return {
		text: text.slice(0, token.start) + inserted + text.slice(token.end),
		cursor: token.start + inserted.length,
	};
}

function findLink(before: string): CaptureToken | null {
	const open = before.lastIndexOf("[[");
	if (open === -1) return null;
	const query = before.slice(open + 2);
	if (query.includes("]]") || /[\r\n]/.test(query)) return null;
	return { kind: "link", query, start: open, end: before.length };
}

function findTag(before: string): CaptureToken | null {
	const match = /(^|\s)#([^\s#]*)$/.exec(before);
	if (!match) return null;
	return { kind: "tag", query: match[2], start: before.length - match[2].length - 1, end: before.length };
}
