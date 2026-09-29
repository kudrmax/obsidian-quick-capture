import { AbstractInputSuggest, App, getIconIds, setIcon } from "obsidian";
import { IconSearch } from "../domain/IconSearch";
import lucideKeywords from "./lucide-keywords.json";

const LUCIDE_PREFIX = "lucide-";
const SUGGESTION_LIMIT = 50;

export class IconSuggest extends AbstractInputSuggest<string> {
	private search: IconSearch | null = null;

	constructor(
		app: App,
		private readonly input: HTMLInputElement,
		private readonly onPick: (icon: string) => void,
	) {
		super(app, input);
		this.limit = SUGGESTION_LIMIT;
	}

	protected override getSuggestions(query: string): string[] {
		this.search ??= new IconSearch(
			getIconIds().map((id) => (id.startsWith(LUCIDE_PREFIX) ? id.slice(LUCIDE_PREFIX.length) : id)),
			lucideKeywords,
		);
		return this.search.find(query);
	}

	override renderSuggestion(icon: string, el: HTMLElement): void {
		el.addClass("dqc-icon-suggestion");
		setIcon(el.createSpan({ cls: "dqc-icon-suggestion-icon" }), icon);
		el.createSpan({ text: icon });
	}

	override selectSuggestion(icon: string): void {
		this.input.value = icon;
		this.onPick(icon);
		this.close();
	}
}
