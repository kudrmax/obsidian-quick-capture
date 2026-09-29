import { AbstractInputSuggest, App, getAllTags, parseFrontMatterAliases, prepareFuzzySearch, TFile } from "obsidian";
import { CaptureToken, findTokenAtCursor, replaceToken } from "../domain/CaptureToken";

interface TagSuggestion {
	kind: "tag";
	tag: string;
	count: number;
	score: number;
}

interface LinkSuggestion {
	kind: "link";
	file: TFile;
	alias: string | null;
	score: number;
}

type Suggestion = TagSuggestion | LinkSuggestion;

interface LinkTarget {
	file: TFile;
	aliases: string[];
}

const SUGGESTION_LIMIT = 20;
const CARET_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

export class CaptureSuggest extends AbstractInputSuggest<Suggestion> {
	private tagCounts: Map<string, number> | null = null;
	private linkTargets: LinkTarget[] | null = null;

	constructor(
		app: App,
		private readonly textarea: HTMLTextAreaElement,
		private readonly linkSourcePath: () => string,
	) {
		super(app, textarea as unknown as HTMLInputElement);
		this.limit = SUGGESTION_LIMIT;
		const refresh = () => textarea.dispatchEvent(new Event("input"));
		textarea.addEventListener("click", refresh);
		textarea.addEventListener("keyup", (event) => {
			if (CARET_KEYS.has(event.key)) refresh();
		});
	}

	protected getSuggestions(): Suggestion[] {
		const token = this.currentToken();
		if (!token) return [];
		const suggestions = token.kind === "tag" ? this.tagSuggestions(token.query) : this.linkSuggestions(token.query);
		return suggestions.slice(0, SUGGESTION_LIMIT);
	}

	renderSuggestion(suggestion: Suggestion, el: HTMLElement): void {
		el.addClass("dqc-suggestion");
		if (suggestion.kind === "tag") {
			el.createSpan({ cls: "dqc-suggestion-title", text: `#${suggestion.tag}` });
			el.createSpan({ cls: "dqc-suggestion-note", text: String(suggestion.count) });
			return;
		}
		el.createSpan({ cls: "dqc-suggestion-title", text: suggestion.alias ?? suggestion.file.basename });
		const folder = suggestion.file.parent?.path ?? "";
		const note = suggestion.alias ? suggestion.file.basename : folder === "/" ? "" : folder;
		if (note) el.createSpan({ cls: "dqc-suggestion-note", text: note });
	}

	override selectSuggestion(suggestion: Suggestion): void {
		const token = this.currentToken();
		if (!token) return;
		const replacement =
			suggestion.kind === "tag"
				? `#${suggestion.tag}`
				: this.app.fileManager.generateMarkdownLink(suggestion.file, this.linkSourcePath(), undefined, suggestion.alias ?? undefined);
		const result = replaceToken(this.textarea.value, token, replacement);
		this.textarea.value = result.text;
		this.textarea.setSelectionRange(result.cursor, result.cursor);
		this.textarea.dispatchEvent(new Event("input"));
		this.close();
	}

	private currentToken(): CaptureToken | null {
		return findTokenAtCursor(this.textarea.value, this.textarea.selectionStart ?? this.textarea.value.length);
	}

	private tagSuggestions(query: string): Suggestion[] {
		const match = prepareFuzzySearch(query);
		const result: TagSuggestion[] = [];
		for (const [tag, count] of this.collectTags()) {
			const score = query ? match(tag)?.score : 0;
			if (score !== undefined) result.push({ kind: "tag", tag, count, score });
		}
		return result.sort((a, b) => b.score - a.score || b.count - a.count);
	}

	private linkSuggestions(query: string): Suggestion[] {
		const match = prepareFuzzySearch(query);
		const result: LinkSuggestion[] = [];
		for (const { file, aliases } of this.collectLinkTargets()) {
			const nameScore = query ? match(file.basename)?.score : 0;
			if (nameScore !== undefined) result.push({ kind: "link", file, alias: null, score: nameScore });
			if (!query) continue;
			for (const alias of aliases) {
				const aliasScore = match(alias)?.score;
				if (aliasScore !== undefined) result.push({ kind: "link", file, alias, score: aliasScore });
			}
		}
		return result.sort((a, b) => b.score - a.score || b.file.stat.mtime - a.file.stat.mtime);
	}

	private collectLinkTargets(): LinkTarget[] {
		this.linkTargets ??= this.app.vault.getMarkdownFiles().map((file) => ({
			file,
			aliases: parseFrontMatterAliases(this.app.metadataCache.getFileCache(file)?.frontmatter) ?? [],
		}));
		return this.linkTargets;
	}

	private collectTags(): Map<string, number> {
		if (this.tagCounts) return this.tagCounts;
		const counts = new Map<string, number>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = cache ? (getAllTags(cache) ?? []) : [];
			for (const tag of tags) {
				const name = tag.replace(/^#/, "");
				counts.set(name, (counts.get(name) ?? 0) + 1);
			}
		}
		this.tagCounts = counts;
		return counts;
	}
}

