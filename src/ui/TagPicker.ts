import { TagGroup } from "../settings";
import { renderTagLabel } from "./TagIcon";

export class TagPicker {
	private readonly layerEl: HTMLElement;

	constructor(
		private readonly screenEl: HTMLElement,
		private readonly groups: () => TagGroup[],
		private readonly selected: Set<string>,
		private readonly onChange: () => void,
	) {
		this.layerEl = screenEl.createDiv({ cls: "dqc-tags" });
		this.layerEl.addEventListener("click", (event) => {
			if (!(event.target as HTMLElement).closest("button")) this.close();
		});
	}

	isOpen(): boolean {
		return this.screenEl.hasClass("is-picking-tags");
	}

	toggle(): void {
		if (this.isOpen()) this.close();
		else this.open();
	}

	open(): void {
		this.render();
		this.screenEl.addClass("is-picking-tags");
		this.onChange();
	}

	close(): void {
		if (!this.isOpen()) return;
		this.screenEl.removeClass("is-picking-tags");
		this.onChange();
	}

	private render(): void {
		this.layerEl.empty();
		for (const group of this.groups()) {
			const tags = group.tags.filter((quickTag) => quickTag.tag.trim() !== "");
			if (tags.length === 0) continue;
			const groupEl = this.layerEl.createDiv({ cls: "dqc-tags-group" });
			if (group.name.trim() !== "") groupEl.createDiv({ cls: "dqc-tags-group-name", text: group.name });
			const row = groupEl.createDiv({ cls: "dqc-tags-row" });
			for (const quickTag of tags) {
				const tag = quickTag.tag.trim();
				const button = row.createEl("button", { cls: "dqc-tag", attr: { "aria-label": tag, title: tag } });
				button.toggleClass("is-text", !renderTagLabel(button, tag, quickTag.icon));
				button.toggleClass("is-selected", this.selected.has(tag));
				button.onclick = () => {
					if (this.selected.has(tag)) this.selected.delete(tag);
					else this.selected.add(tag);
					button.toggleClass("is-selected", this.selected.has(tag));
					this.close();
				};
			}
		}
	}
}

export function hasQuickTags(groups: TagGroup[]): boolean {
	return groups.some((group) => group.tags.some((quickTag) => quickTag.tag.trim() !== ""));
}
