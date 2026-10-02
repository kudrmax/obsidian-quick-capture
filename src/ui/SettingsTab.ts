import { App, DropdownComponent, ExtraButtonComponent, getIcon, Plugin, PluginSettingTab, setIcon, Setting, TextComponent } from "obsidian";
import {
	AfterSend,
	AfterSendChoice,
	AudioLinkChoice,
	CaptureMode,
	EntryFormat,
	HeadingLevelChoice,
	listDestinations,
	ModeFile,
	modeTagGroups,
	NO_OVERRIDES,
	noteName,
	resolveEmbedAudio,
	resolveFormat,
} from "../domain/CaptureMode";
import { systemClock } from "../domain/Clock";
import { moveItem } from "../domain/ListOrder";
import { EntryPreview, modeSummary, previewEntries } from "../domain/SettingsPreview";
import { CaptureSettings, newId, QuickTag, TagGroup } from "../settings";
import { FileSuggest } from "./FileSuggest";
import { IconPicker } from "./IconPicker";
import { SettingsCard } from "./SettingsCard";
import { renderTagLabel } from "./TagIcon";

export interface SettingsHost extends Plugin {
	settings: CaptureSettings;
	saveSettings(): Promise<void>;
}

type TextFormatKey = "heading" | "textPrefix" | "textSuffix" | "audioPrefix" | "audioSuffix";
type FormatTexts = Record<TextFormatKey, string>;

interface FormatFieldsOptions {
	placeholder(key: TextFormatKey): string;
	levels: [value: string, label: string][];
	level: string;
	setLevel(value: string): void;
	hint: string;
	preview(): EntryPreview;
}

const LEVELS = [1, 2, 3, 4, 5, 6];
const LEVEL_OPTIONS = LEVELS.map((level): [string, string] => [String(level), `H${level}`]);
const PLACEHOLDER_HINT = "{{time}} → 23:35 · {{date}} → 2026-09-30 · spaces at the edges are kept";
const HEADING_HINT = "Entries go to the end of the heading's section. A missing heading is created at the end of the note. No heading: end of the note.";
const DEFAULTS_KEY = "defaults";
const AFTER_SEND_OPTIONS: Record<AfterSend, string> = {
	close: "Close the screen",
	stay: "Stay for the next entry",
	open: "Open the note",
};
const AUDIO_LINK_OPTIONS: Record<Exclude<AudioLinkChoice, "default">, string> = {
	embed: "Embed: ![[Recording.m4a]]",
	link: "Link: [[Recording.m4a]]",
};
const AUDIO_LINK_HINT = "An embed shows a player in the note, a link stays plain text.";

export class SettingsTab extends PluginSettingTab {
	private openCard: string | null = null;
	private cards = new Map<string, SettingsCard>();
	private refreshers: (() => void)[] = [];

	constructor(app: App, private readonly host: SettingsHost) {
		super(app, host);
	}

	override display(): void {
		this.containerEl.empty();
		this.containerEl.addClass("dqc-settings");
		this.cards = new Map();
		this.refreshers = [];
		this.generalSettings();
		this.modeSettings();
		this.tagGroupSettings();
		this.refresh();
	}

	private get settings(): CaptureSettings {
		return this.host.settings;
	}

	private modeSettings(): void {
		new Setting(this.containerEl)
			.setName("Modes")
			.setDesc("Where an entry goes. Tap the title on the capture screen to switch.")
			.setHeading();
		this.defaultsCard();
		this.settings.modes.forEach((mode, index) => this.modeCard(mode, index));
		this.addButton(this.containerEl, "Add mode", async () => {
			const mode: CaptureMode = {
				id: newId(),
				title: "",
				target: { type: "files", files: [emptyFile()] },
				overrides: { ...NO_OVERRIDES },
				afterSend: "default",
				audioLink: "default",
				tagGroupIds: [],
			};
			this.settings.modes.push(mode);
			this.openCard = modeKey(mode);
			await this.saveAndRedraw();
		});
	}

	private modeCard(mode: CaptureMode, index: number): void {
		const card = this.card(modeKey(mode));
		const body = card.bodyEl;
		const isDaily = mode.target.type === "daily";

		label(body, "Name");
		new TextComponent(line(body))
			.setPlaceholder(isDaily ? "Today's date" : "Name, e.g. Books")
			.setValue(mode.title)
			.onChange((value) => {
				mode.title = value;
				return this.changed();
			});
		hint(body, isDaily ? "Title of the capture screen." : "Name of this group of files. Shown only here.");

		const refreshTarget = this.targetFields(body, mode);
		const refreshFormat = this.formatFields(body, mode.overrides, {
			placeholder: (key) => this.settings.defaults[key] || (key === "heading" ? "No heading" : "empty"),
			levels: [["default", `Default (H${this.settings.defaults.headingLevel})`], ...LEVEL_OPTIONS, ["none", "No heading"]],
			level: String(mode.overrides.headingLevel),
			setLevel: (value) => (mode.overrides.headingLevel = parseLevelChoice(value)),
			hint: `${PLACEHOLDER_HINT} · an empty field uses the default`,
			preview: () =>
				previewEntries(
					resolveFormat(this.settings.defaults, mode.overrides),
					resolveEmbedAudio(this.settings.embedAudio, mode),
					systemClock,
					this.sampleTag(mode),
				),
		});
		this.modeChoices(body, mode);
		this.modeTagGroups(body, mode);
		this.modeFooter(body, mode, index);

		this.refreshers.push(() => {
			card.setTitle(mode.title.trim() || (isDaily ? "Daily note" : `Mode ${index + 1}`));
			card.summaryEl.setText(modeSummary(mode, this.settings.defaults));
			refreshTarget();
			refreshFormat();
		});
	}

	private targetFields(body: HTMLElement, mode: CaptureMode): () => void {
		label(body, "Writes to");
		const options = body.createDiv({ cls: "dqc-seg" });
		const daily = this.targetOption(options, mode, "daily", "Daily note");
		this.targetOption(options, mode, "files", "Files");
		const lockHint = hint(body, "Remove the files below to switch to the daily note.");
		const target = mode.target;
		let filesHint: HTMLElement | null = null;
		if (target.type === "files") {
			target.files.forEach((file, index) => this.fileLine(body, target.files, file, index));
			this.addLink(body, "Add file", async () => {
				target.files.push(emptyFile());
				await this.saveAndRedraw();
			});
			filesHint = hint(body, "");
		}
		return () => {
			const locked = hasFiles(mode);
			daily.disabled = locked;
			lockHint.toggle(locked);
			filesHint?.setText(
				listDestinations([mode], "").length === 0
					? "Add a file to see this mode on the capture screen."
					: "Each file shows up on the capture screen by its alias, or by its name when the alias is empty.",
			);
		};
	}

	private targetOption(container: HTMLElement, mode: CaptureMode, type: "daily" | "files", text: string): HTMLButtonElement {
		const option = container.createEl("button", { text, cls: "dqc-seg-option" });
		option.toggleClass("is-active", mode.target.type === type);
		option.addEventListener("click", async () => {
			if (mode.target.type === type || hasFiles(mode)) return;
			mode.target = type === "daily" ? { type: "daily" } : { type: "files", files: [emptyFile()] };
			await this.saveAndRedraw();
		});
		return option;
	}

	private fileLine(body: HTMLElement, files: ModeFile[], file: ModeFile, index: number): void {
		const row = line(body, "dqc-file-line");
		const alias = new TextComponent(row).setValue(file.alias).onChange((value) => {
			file.alias = value;
			return this.changed();
		});
		alias.inputEl.addClass("dqc-file-alias");
		const showAliasPlaceholder = () => alias.setPlaceholder(noteName(file.path) || "Alias");
		showAliasPlaceholder();
		const savePath = (value: string) => {
			file.path = value;
			showAliasPlaceholder();
			return this.changed();
		};
		const path = new TextComponent(row).setPlaceholder("Books/Book.md").setValue(file.path).onChange(savePath);
		new FileSuggest(this.app, path.inputEl, (picked) => void savePath(picked));
		iconButton(row, "x", "Remove file from this mode", async () => {
			files.splice(index, 1);
			await this.saveAndRedraw();
		});
	}

	private modeTagGroups(body: HTMLElement, mode: CaptureMode): void {
		label(body, "Quick tags");
		if (this.settings.tagGroups.length === 0) {
			hint(body, "No tag groups yet. Add one in Quick tags below.");
			return;
		}
		const chips = body.createDiv({ cls: "dqc-chips" });
		this.settings.tagGroups.forEach((group, index) => {
			const chip = chips.createEl("button", { cls: "dqc-chip", text: groupName(group, index) });
			const show = () => {
				const on = mode.tagGroupIds.includes(group.id);
				chip.toggleClass("is-active", on);
				chip.setAttribute("aria-pressed", String(on));
			};
			show();
			chip.addEventListener("click", async () => {
				const on = !mode.tagGroupIds.includes(group.id);
				mode.tagGroupIds = this.settings.tagGroups
					.map((candidate) => candidate.id)
					.filter((id) => (id === group.id ? on : mode.tagGroupIds.includes(id)));
				show();
				await this.changed();
			});
		});
	}

	private modeChoices(body: HTMLElement, mode: CaptureMode): void {
		const defaultAudioLink = AUDIO_LINK_OPTIONS[this.settings.embedAudio ? "embed" : "link"];
		choice(body, "Audio", { default: `Default (${defaultAudioLink})`, ...AUDIO_LINK_OPTIONS }, mode.audioLink, (value) => {
			mode.audioLink = value as AudioLinkChoice;
			return this.changed();
		});
		hint(body, AUDIO_LINK_HINT);
		const defaultAfterSend = AFTER_SEND_OPTIONS[this.settings.afterSend];
		choice(body, "After sending", { default: `Default (${defaultAfterSend})`, ...AFTER_SEND_OPTIONS }, mode.afterSend, (value) => {
			mode.afterSend = value as AfterSendChoice;
			return this.changed();
		});
	}

	private modeFooter(body: HTMLElement, mode: CaptureMode, index: number): void {
		const modes = this.settings.modes;
		const footer = body.createDiv({ cls: "dqc-card-footer" });
		const move = (step: -1 | 1) => async () => {
			moveItem(modes, index, step);
			await this.saveAndRedraw();
		};
		iconButton(footer, "arrow-up", "Move mode up", move(-1), index === 0);
		iconButton(footer, "arrow-down", "Move mode down", move(1), index === modes.length - 1);
		footer.createDiv({ cls: "dqc-spacer" });
		if (modes.length > 1) {
			this.dangerLink(footer, "Delete mode", async () => {
				modes.splice(index, 1);
				await this.saveAndRedraw();
			});
		}
	}

	private sampleTag(mode: CaptureMode): string {
		const tags = modeTagGroups(this.settings.tagGroups, mode).flatMap((group) => group.tags);
		return tags.find((quickTag) => quickTag.tag.trim() !== "")?.tag ?? "";
	}

	private formatFields(body: HTMLElement, texts: FormatTexts, options: FormatFieldsOptions): () => void {
		const inputs = new Map<TextFormatKey, TextComponent>();
		const text = (parent: HTMLElement, key: TextFormatKey) => {
			inputs.set(
				key,
				new TextComponent(parent).setValue(texts[key]).onChange((value) => {
					texts[key] = value;
					return this.changed();
				}),
			);
		};
		const pair = (name: string, prefix: TextFormatKey, suffix: TextFormatKey) => {
			const row = namedLine(body, name);
			text(row, prefix);
			text(row, suffix);
		};

		label(body, "Format");
		const headingRow = namedLine(body, "Heading");
		text(headingRow, "heading");
		const level = new DropdownComponent(headingRow);
		for (const [value, name] of options.levels) level.addOption(value, name);
		level.setValue(options.level).onChange((value) => {
			options.setLevel(value);
			return this.changed();
		});
		const columns = namedLine(body, "");
		columns.addClass("dqc-line-header");
		columns.createSpan({ text: "Prefix" });
		columns.createSpan({ text: "Suffix" });
		pair("Text", "textPrefix", "textSuffix");
		pair("Audio", "audioPrefix", "audioSuffix");
		hint(body, HEADING_HINT);
		hint(body, options.hint);
		const preview = body.createDiv({ cls: "dqc-preview" });

		return () => {
			inputs.forEach((input, key) => input.setPlaceholder(options.placeholder(key)));
			renderPreview(preview, options.preview());
		};
	}

	private tagGroupSettings(): void {
		new Setting(this.containerEl)
			.setName("Quick tags")
			.setDesc("Tags you add to an entry with the # button. They go right before the suffix. Turn groups on inside each mode.")
			.setHeading();
		this.settings.tagGroups.forEach((group, index) => this.tagGroupCard(group, index));
		this.addButton(this.containerEl, "Add group", async () => {
			const group: TagGroup = { id: newId(), name: "", tags: [{ tag: "", icon: "" }] };
			this.settings.tagGroups.push(group);
			this.openCard = groupKey(group);
			await this.saveAndRedraw();
		});
	}

	private tagGroupCard(group: TagGroup, index: number): void {
		const card = this.card(groupKey(group));
		const body = card.bodyEl;

		label(body, "Name");
		new TextComponent(line(body))
			.setPlaceholder("Name, e.g. Books")
			.setValue(group.name)
			.onChange((value) => {
				group.name = value;
				return this.changed();
			});

		label(body, "Tags");
		group.tags.forEach((quickTag, tagIndex) => this.tagLine(body, group, quickTag, tagIndex));
		this.addLink(body, "Add tag", async () => {
			group.tags.push({ tag: "", icon: "" });
			await this.saveAndRedraw();
		});
		const usage = hint(body, "");

		const footer = body.createDiv({ cls: "dqc-card-footer" });
		footer.createDiv({ cls: "dqc-spacer" });
		this.dangerLink(footer, "Delete group", async () => {
			this.settings.tagGroups.splice(index, 1);
			for (const mode of this.settings.modes) mode.tagGroupIds = mode.tagGroupIds.filter((id) => id !== group.id);
			await this.saveAndRedraw();
		});

		this.refreshers.push(() => {
			card.setTitle(groupName(group, index));
			renderTagSummary(card.summaryEl, group);
			const users = this.settings.modes
				.map((mode, modeIndex) => ({ mode, name: mode.title.trim() || (mode.target.type === "daily" ? "Daily note" : `Mode ${modeIndex + 1}`) }))
				.filter(({ mode }) => mode.tagGroupIds.includes(group.id))
				.map(({ name }) => name);
			usage.setText(users.length > 0 ? `Used in: ${users.join(", ")}` : "Not used yet. Turn it on inside a mode.");
		});
	}

	private tagLine(body: HTMLElement, group: TagGroup, quickTag: QuickTag, index: number): void {
		const row = line(body);
		const iconEl = row.createEl("button", { cls: "dqc-icon-choice", attr: { "aria-label": "Choose icon" } });
		const showIcon = () => {
			iconEl.empty();
			const svg = quickTag.icon.trim() === "" ? null : getIcon(quickTag.icon.trim());
			iconEl.toggleClass("is-empty", svg === null);
			if (svg) iconEl.appendChild(svg);
			else setIcon(iconEl, "smile-plus");
		};
		showIcon();
		iconEl.addEventListener("click", () => {
			new IconPicker(this.app, (icon) => {
				quickTag.icon = icon;
				showIcon();
				void this.changed();
			}).open();
		});
		new TextComponent(row)
			.setPlaceholder("#tag")
			.setValue(quickTag.tag)
			.onChange((value) => {
				quickTag.tag = value;
				return this.changed();
			});
		const move = (step: -1 | 1) => async () => {
			moveItem(group.tags, index, step);
			await this.saveAndRedraw();
		};
		iconButton(row, "arrow-up", "Move up", move(-1), index === 0);
		iconButton(row, "arrow-down", "Move down", move(1), index === group.tags.length - 1);
		iconButton(row, "x", "Remove tag", async () => {
			group.tags.splice(index, 1);
			await this.saveAndRedraw();
		});
	}

	private generalSettings(): void {
		const { containerEl } = this;
		new Setting(containerEl).setName("General").setHeading();
		new Setting(containerEl)
			.setName("Open keyboard on iPhone and iPad")
			.setDesc("The keyboard shows as soon as the capture screen opens. Turn off to start with voice more often.")
			.addToggle((toggle) =>
				toggle.setValue(this.settings.openKeyboardOnMobile).onChange((value) => {
					this.settings.openKeyboardOnMobile = value;
					return this.changed();
				}),
			);
	}

	private defaultsCard(): void {
		const defaults: EntryFormat = this.settings.defaults;
		const card = this.card(DEFAULTS_KEY);
		card.setTitle("Default format");
		card.summaryEl.setText("Every mode uses it unless the mode sets its own.");
		const refreshFormat = this.formatFields(card.bodyEl, defaults, {
			placeholder: (key) => DEFAULT_PLACEHOLDERS[key],
			levels: LEVEL_OPTIONS,
			level: String(defaults.headingLevel),
			setLevel: (value) => (defaults.headingLevel = Number(value)),
			hint: PLACEHOLDER_HINT,
			preview: () => previewEntries(resolveFormat(defaults, NO_OVERRIDES), this.settings.embedAudio, systemClock),
		});
		this.refreshers.push(refreshFormat);
		choice(card.bodyEl, "Audio", AUDIO_LINK_OPTIONS, this.settings.embedAudio ? "embed" : "link", async (value) => {
			this.settings.embedAudio = value === "embed";
			await this.saveAndRedraw();
		});
		hint(card.bodyEl, AUDIO_LINK_HINT);
		choice(card.bodyEl, "After sending", AFTER_SEND_OPTIONS, this.settings.afterSend, async (value) => {
			this.settings.afterSend = value as AfterSend;
			await this.saveAndRedraw();
		});
	}

	private card(key: string): SettingsCard {
		const card = new SettingsCard(this.containerEl, () => {
			this.openCard = this.openCard === key ? null : key;
			this.showOpenCard();
		});
		card.setOpen(this.openCard === key);
		this.cards.set(key, card);
		return card;
	}

	private showOpenCard(): void {
		this.cards.forEach((card, key) => card.setOpen(key === this.openCard));
	}

	private addButton(container: HTMLElement, text: string, onClick: () => Promise<void>): void {
		container.createEl("button", { cls: "dqc-add-card", text: `+ ${text}` }).addEventListener("click", () => void onClick());
	}

	private addLink(container: HTMLElement, text: string, onClick: () => Promise<void>): void {
		container.createEl("button", { cls: "dqc-link", text: `+ ${text}` }).addEventListener("click", () => void onClick());
	}

	private dangerLink(container: HTMLElement, text: string, onClick: () => Promise<void>): void {
		container.createEl("button", { cls: "dqc-link is-danger", text }).addEventListener("click", () => void onClick());
	}

	private refresh(): void {
		for (const refresh of this.refreshers) refresh();
	}

	private async changed(): Promise<void> {
		this.refresh();
		await this.host.saveSettings();
	}

	private async saveAndRedraw(): Promise<void> {
		await this.host.saveSettings();
		this.display();
	}
}

const DEFAULT_PLACEHOLDERS: FormatTexts = {
	heading: "No heading, e.g. Journal",
	textPrefix: "empty",
	textSuffix: "empty",
	audioPrefix: "empty",
	audioSuffix: "empty, e.g. #transcribe",
};

function modeKey(mode: CaptureMode): string {
	return `mode:${mode.id}`;
}

function groupKey(group: TagGroup): string {
	return `group:${group.id}`;
}

function groupName(group: TagGroup, index: number): string {
	return group.name.trim() || `Group ${index + 1}`;
}

function hasFiles(mode: CaptureMode): boolean {
	return mode.target.type === "files" && mode.target.files.some((file) => file.path.trim() !== "");
}

function emptyFile(): ModeFile {
	return { id: newId(), alias: "", path: "", lastUsedAt: 0 };
}

function parseLevelChoice(value: string): HeadingLevelChoice {
	return value === "default" || value === "none" ? value : Number(value);
}

function label(parent: HTMLElement, text: string): void {
	parent.createDiv({ cls: "dqc-label", text });
}

function choice(
	parent: HTMLElement,
	name: string,
	options: Record<string, string>,
	value: string,
	onChange: (value: string) => Promise<void>,
): void {
	label(parent, name);
	const dropdown = new DropdownComponent(line(parent)).addOptions(options).setValue(value).onChange(onChange);
	dropdown.selectEl.addClass("dqc-choice");
}

function hint(parent: HTMLElement, text: string): HTMLElement {
	return parent.createDiv({ cls: "dqc-hint", text });
}

function line(parent: HTMLElement, cls = ""): HTMLElement {
	return parent.createDiv({ cls: `dqc-line ${cls}`.trim() });
}

function namedLine(parent: HTMLElement, name: string): HTMLElement {
	const row = line(parent, "dqc-named-line");
	row.createSpan({ cls: "dqc-line-name", text: name });
	return row;
}

function iconButton(parent: HTMLElement, icon: string, tooltip: string, onClick: () => Promise<void>, disabled = false): void {
	new ExtraButtonComponent(parent)
		.setIcon(icon)
		.setTooltip(tooltip)
		.setDisabled(disabled)
		.onClick(() => void onClick());
}

function renderPreview(el: HTMLElement, preview: EntryPreview): void {
	el.empty();
	if (preview.heading !== null) el.createDiv({ cls: "dqc-preview-heading", text: preview.heading });
	el.createDiv({ text: preview.text });
	el.createDiv({ text: preview.audio });
}

function renderTagSummary(el: HTMLElement, group: TagGroup): void {
	el.empty();
	const tags = group.tags.filter((quickTag) => quickTag.tag.trim() !== "");
	if (tags.length === 0) {
		el.setText("No tags yet");
		return;
	}
	for (const quickTag of tags) renderTagLabel(el.createSpan({ cls: "dqc-tag-row-preview" }), quickTag.tag, quickTag.icon);
}
