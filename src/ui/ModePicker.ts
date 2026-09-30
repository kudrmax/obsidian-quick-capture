import { Destination } from "../domain/CaptureMode";

export class ModePicker {
	private readonly layerEl: HTMLElement;
	private readonly resizeObserver: ResizeObserver;

	constructor(
		private readonly screenEl: HTMLElement,
		private readonly anchorEl: HTMLElement,
		private readonly destinations: () => Destination[],
		private readonly currentId: () => string,
		private readonly onPick: (id: string) => void,
		private readonly onChange: () => void,
	) {
		this.layerEl = screenEl.createDiv({ cls: "dqc-modes" });
		this.layerEl.addEventListener("click", (event) => {
			if (!(event.target as HTMLElement).closest("button")) this.close();
		});
		this.resizeObserver = new ResizeObserver(() => {
			this.reposition();
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

	reposition(): void {
		if (this.isOpen()) this.placeUnderAnchor();
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
		for (const destination of this.destinations()) {
			const button = this.layerEl.createEl("button", { cls: "dqc-mode", text: destination.title });
			button.toggleClass("is-current", destination.id === this.currentId());
			button.onclick = () => {
				this.close();
				if (destination.id !== this.currentId()) this.onPick(destination.id);
			};
		}
	}
}
