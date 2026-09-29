import { getIcon } from "obsidian";

export function renderTagLabel(el: HTMLElement, tag: string, icon: string): boolean {
	el.empty();
	const svg = icon.trim() === "" ? null : getIcon(icon.trim());
	if (svg) el.appendChild(svg);
	else el.setText(tag);
	return svg !== null;
}
