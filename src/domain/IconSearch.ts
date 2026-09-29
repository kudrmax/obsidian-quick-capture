export type IconKeywords = Record<string, readonly string[]>;

const NO_MATCH = Number.POSITIVE_INFINITY;

export class IconSearch {
	private readonly names: string[];

	constructor(
		names: readonly string[],
		private readonly keywords: IconKeywords,
	) {
		this.names = [...new Set(names)].sort();
	}

	find(query: string): string[] {
		const needle = query.trim().toLowerCase();
		if (needle === "") return [...this.names];
		return this.names
			.map((name) => ({ name, rank: this.rank(name, needle) }))
			.filter((match) => match.rank !== NO_MATCH)
			.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
			.map((match) => match.name);
	}

	private rank(name: string, needle: string): number {
		const words = name.split("-");
		const keywords = (this.keywords[name] ?? []).map((keyword) => keyword.toLowerCase());
		if (name === needle) return 0;
		if (name.startsWith(needle)) return 1;
		if (words.includes(needle)) return 2;
		if (words.some((word) => word.startsWith(needle))) return 3;
		const exactKeyword = keywords.indexOf(needle);
		if (exactKeyword !== -1) return 4 + keywordWeight(exactKeyword);
		const keywordPrefix = keywords.findIndex((keyword) => keyword.startsWith(needle));
		if (keywordPrefix !== -1) return 5 + keywordWeight(keywordPrefix);
		if (name.includes(needle)) return 6;
		return NO_MATCH;
	}
}

function keywordWeight(position: number): number {
	return position / (position + 1);
}
