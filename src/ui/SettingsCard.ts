import { setIcon } from "obsidian";

export class SettingsCard {
	readonly summaryEl: HTMLElement;
	readonly bodyEl: HTMLElement;
	private readonly el: HTMLElement;
	private readonly headEl: HTMLElement;
	private readonly titleEl: HTMLElement;

	constructor(parent: HTMLElement, onToggle: () => void) {
		this.el = parent.createDiv({ cls: "dqc-card" });
		this.headEl = this.el.createDiv({ cls: "dqc-card-head", attr: { role: "button", tabindex: "0" } });
		setIcon(this.headEl.createSpan({ cls: "dqc-card-chevron" }), "chevron-right");
		const main = this.headEl.createDiv({ cls: "dqc-card-main" });
		this.titleEl = main.createDiv({ cls: "dqc-card-title" });
		this.summaryEl = main.createDiv({ cls: "dqc-card-summary" });
		this.bodyEl = this.el.createDiv({ cls: "dqc-card-body" });
		this.headEl.addEventListener("click", onToggle);
		this.headEl.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			onToggle();
		});
	}

	setTitle(title: string): void {
		this.titleEl.setText(title);
	}

	setOpen(open: boolean): void {
		this.el.toggleClass("is-open", open);
		this.headEl.setAttribute("aria-expanded", String(open));
	}
}
