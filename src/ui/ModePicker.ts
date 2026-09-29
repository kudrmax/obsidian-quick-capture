import { CaptureMode } from "../domain/CaptureMode";

export class ModePicker {
	private readonly layerEl: HTMLElement;
	private readonly resizeObserver: ResizeObserver;

	constructor(
		private readonly screenEl: HTMLElement,
		private readonly anchorEl: HTMLElement,
		private readonly modes: () => CaptureMode[],
		private readonly currentId: () => string,
		private readonly title: (mode: CaptureMode) => string,
		private readonly onPick: (id: string) => void,
		private readonly onChange: () => void,
	) {
		this.layerEl = screenEl.createDiv({ cls: "dqc-modes" });
		this.layerEl.addEventListener("click", (event) => {
			if (!(event.target as HTMLElement).closest("button")) this.close();
		});
		this.resizeObserver = new ResizeObserver(() => {
			if (this.isOpen()) this.placeUnderAnchor();
		});
		this.resizeObserver.observe(screenEl);
	}

	destroy(): void {
		this.resizeObserver.disconnect();
	}

	isOpen(): boolean {
		return this.screenEl.hasClass("is-picking-mode");
	}

	toggle(): void {
		if (this.isOpen()) this.close();
		else this.open();
	}

	open(): void {
		this.render();
		this.placeUnderAnchor();
		this.screenEl.addClass("is-picking-mode");
		this.onChange();
	}

	close(): void {
		if (!this.isOpen()) return;
		this.screenEl.removeClass("is-picking-mode");
		this.onChange();
	}

	private placeUnderAnchor(): void {
		const top = this.anchorEl.getBoundingClientRect().bottom - this.screenEl.getBoundingClientRect().top;
		this.layerEl.style.setProperty("--dqc-modes-top", `${top}px`);
	}

	private render(): void {
		this.layerEl.empty();
		for (const mode of this.modes()) {
			const button = this.layerEl.createEl("button", { cls: "dqc-mode", text: this.title(mode) });
			button.toggleClass("is-current", mode.id === this.currentId());
			button.onclick = () => {
				this.close();
				if (mode.id !== this.currentId()) this.onPick(mode.id);
			};
		}
	}
}
