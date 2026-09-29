import { TagGroup } from "../settings";
import { renderTagLabel } from "./TagIcon";

export class TagPicker {
	private readonly overlayEl: HTMLElement;
	private readonly sheetEl: HTMLElement;

	constructor(
		container: HTMLElement,
		private readonly groups: () => TagGroup[],
		private readonly selected: Set<string>,
		private readonly onChange: () => void,
	) {
		this.overlayEl = container.createDiv({ cls: "dqc-tags" });
		this.overlayEl.addEventListener("click", (event) => {
			if (event.target === this.overlayEl) this.close();
		});
		this.sheetEl = this.overlayEl.createDiv({ cls: "dqc-tags-sheet" });
	}

	isOpen(): boolean {
		return this.overlayEl.hasClass("is-open");
	}

	open(): void {
		this.render();
		this.overlayEl.addClass("is-open");
	}

	close(): void {
		this.overlayEl.removeClass("is-open");
	}

	private render(): void {
		this.sheetEl.empty();
		for (const group of this.groups()) {
			const tags = group.tags.filter((quickTag) => quickTag.tag.trim() !== "");
			if (tags.length === 0) continue;
			const groupEl = this.sheetEl.createDiv({ cls: "dqc-tags-group" });
			if (group.name.trim() !== "") groupEl.createDiv({ cls: "dqc-tags-group-name", text: group.name });
			const chips = groupEl.createDiv({ cls: "dqc-tags-chips" });
			for (const quickTag of tags) {
				const tag = quickTag.tag.trim();
				const chip = chips.createEl("button", { cls: "dqc-tag-chip", attr: { "aria-label": tag, title: tag } });
				renderTagLabel(chip, tag, quickTag.icon);
				chip.toggleClass("is-selected", this.selected.has(tag));
				chip.onclick = () => {
					if (this.selected.has(tag)) this.selected.delete(tag);
					else this.selected.add(tag);
					chip.toggleClass("is-selected", this.selected.has(tag));
					this.onChange();
				};
			}
		}
	}
}

export function hasQuickTags(groups: TagGroup[]): boolean {
	return groups.some((group) => group.tags.some((quickTag) => quickTag.tag.trim() !== ""));
}
