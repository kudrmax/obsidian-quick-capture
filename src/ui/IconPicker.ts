import { App, getIconIds, setIcon, SuggestModal } from "obsidian";
import { IconSearch } from "../domain/IconSearch";
import lucideKeywords from "./lucide-keywords.json";

const LUCIDE_PREFIX = "lucide-";
const SUGGESTION_LIMIT = 50;
const NO_ICON = "";

export class IconPicker extends SuggestModal<string> {
	private search: IconSearch | null = null;

	constructor(
		app: App,
		private readonly onPick: (icon: string) => void,
	) {
		super(app);
		this.limit = SUGGESTION_LIMIT;
		this.setPlaceholder("Search icons, e.g. book");
	}

	override getSuggestions(query: string): string[] {
		this.search ??= new IconSearch(
			getIconIds().map((id) => (id.startsWith(LUCIDE_PREFIX) ? id.slice(LUCIDE_PREFIX.length) : id)),
			lucideKeywords,
		);
		const found = this.search.find(query);
		return query.trim() === "" ? [NO_ICON, ...found] : found;
	}

	override renderSuggestion(icon: string, el: HTMLElement): void {
		el.addClass("dqc-icon-suggestion");
		const iconEl = el.createSpan({ cls: "dqc-icon-suggestion-icon" });
		if (icon !== NO_ICON) setIcon(iconEl, icon);
		el.createSpan({ text: icon === NO_ICON ? "No icon, show the tag as text" : icon });
	}

	override onChooseSuggestion(icon: string): void {
		this.onPick(icon);
	}
}
