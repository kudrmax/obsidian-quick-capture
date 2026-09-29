import { AbstractInputSuggest, App, TFile } from "obsidian";

const SUGGESTION_LIMIT = 50;

export class FileSuggest extends AbstractInputSuggest<TFile> {
	constructor(
		app: App,
		private readonly input: HTMLInputElement,
		private readonly onPick: (path: string) => void,
	) {
		super(app, input);
		this.limit = SUGGESTION_LIMIT;
	}

	protected override getSuggestions(query: string): TFile[] {
		const needle = query.trim().toLowerCase();
		return this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path.toLowerCase().includes(needle))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	override renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	override selectSuggestion(file: TFile): void {
		this.input.value = file.path;
		this.onPick(file.path);
		this.close();
	}
}
