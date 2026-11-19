import { App, Modal } from "obsidian";

export class HintModal extends Modal {
	constructor(app: App, private readonly title: string, private readonly text: string) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass("dqc-hint-modal");
		this.setTitle(this.title);
		this.contentEl.createDiv({ cls: "dqc-hint-text", text: this.text });
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}

export class HintEditModal extends Modal {
	constructor(
		app: App,
		private readonly title: string,
		private readonly hint: string,
		private readonly onChange: (hint: string) => void,
		private readonly onDone: () => void,
	) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass("dqc-hint-modal");
		this.setTitle(this.title.trim() || "Hint");
		const textarea = this.contentEl.createEl("textarea", {
			cls: "dqc-hint-input",
			attr: { rows: "14", placeholder: "Shown when the ? next to the title is tapped" },
		});
		textarea.value = this.hint;
		textarea.addEventListener("input", () => this.onChange(textarea.value));
		textarea.focus();
		textarea.setSelectionRange(0, 0);
		textarea.scrollTop = 0;
	}

	override onClose(): void {
		this.contentEl.empty();
		this.onDone();
	}
}
