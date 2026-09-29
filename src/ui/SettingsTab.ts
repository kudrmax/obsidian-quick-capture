import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { CaptureMode, FormatOverrides, HeadingLevelChoice, listDestinations, ModeFile, NO_OVERRIDES, noteName } from "../domain/CaptureMode";
import { moveItem } from "../domain/ListOrder";
import { AfterSend, CaptureSettings, newId, TagGroup } from "../settings";
import { FileSuggest } from "./FileSuggest";
import { IconSuggest } from "./IconSuggest";
import { renderTagLabel } from "./TagIcon";

export interface SettingsHost extends Plugin {
	settings: CaptureSettings;
	saveSettings(): Promise<void>;
}

type TextFormatKey = "heading" | "textPrefix" | "textSuffix" | "audioPrefix" | "audioSuffix";

interface TextFormatField {
	key: TextFormatKey;
	name: string;
	description: string;
}

const TIME_HINT = "{{time}} becomes the current time, e.g. 23:35, and {{date}} the current date, e.g. 2026-09-30. Spaces at the edges are kept.";
const LEVELS = [1, 2, 3, 4, 5, 6];

const FORMAT_FIELDS: TextFormatField[] = [
	{
		key: "heading",
		name: "Heading",
		description:
			"Entries go to the end of this heading's section. If the note has no such heading, it is created at the end of the note. Leave empty to add to the end of the note.",
	},
	{ key: "textPrefix", name: "Text prefix", description: TIME_HINT },
	{ key: "textSuffix", name: "Text suffix", description: TIME_HINT },
	{ key: "audioPrefix", name: "Audio prefix", description: TIME_HINT },
	{ key: "audioSuffix", name: "Audio suffix", description: `${TIME_HINT} Useful for a tag, e.g. " #transcribe".` },
];

export class SettingsTab extends PluginSettingTab {
	constructor(app: App, private readonly host: SettingsHost) {
		super(app, host);
	}

	override display(): void {
		this.containerEl.empty();
		this.defaultSettings();
		this.modeSettings();
		this.tagGroupSettings();
	}

	private get settings(): CaptureSettings {
		return this.host.settings;
	}

	private defaultSettings(): void {
		const { containerEl } = this;
		const defaults = this.settings.defaults;
		new Setting(containerEl).setName("Defaults").setDesc("Every mode uses these unless it sets its own.").setHeading();
		this.formatText(containerEl, FORMAT_FIELDS[0], defaults.heading, "Journal", (value) => (defaults.heading = value));
		new Setting(containerEl)
			.setName("Heading level")
			.setDesc("Used when the heading is created.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(Object.fromEntries(LEVELS.map((level) => [String(level), `H${level}`])))
					.setValue(String(defaults.headingLevel))
					.onChange(async (value) => {
						defaults.headingLevel = Number(value);
						await this.host.saveSettings();
					}),
			);
		for (const field of FORMAT_FIELDS.slice(1)) {
			this.formatText(containerEl, field, defaults[field.key], "", (value) => (defaults[field.key] = value));
		}
		new Setting(containerEl)
			.setName("Embed audio")
			.setDesc("On: ![[Recording.m4a]] shows a player. Off: [[Recording.m4a]] is a plain link.")
			.addToggle((toggle) =>
				toggle.setValue(this.settings.embedAudio).onChange(async (value) => {
					this.settings.embedAudio = value;
					await this.host.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("After sending")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ close: "Close the screen", stay: "Stay for the next entry" })
					.setValue(this.settings.afterSend)
					.onChange(async (value) => {
						this.settings.afterSend = value as AfterSend;
						await this.host.saveSettings();
					}),
			);
	}

	private modeSettings(): void {
		new Setting(this.containerEl)
			.setName("Modes")
			.setDesc("Where an entry goes. A mode writes to the daily note or to any of its files. Tap the title on the capture screen to switch. Empty fields use the defaults.")
			.setHeading();
		this.settings.modes.forEach((mode, index) => this.modeSetting(mode, index));
		new Setting(this.containerEl).addButton((button) =>
			button.setButtonText("Add mode").onClick(async () => {
				this.settings.modes.push({
					id: newId(),
					title: "",
					target: { type: "files", files: [emptyFile()] },
					overrides: { ...NO_OVERRIDES },
					tagGroupIds: [],
				});
				await this.saveAndRedraw();
			}),
		);
	}

	private modeSetting(mode: CaptureMode, index: number): void {
		const box = this.containerEl.createDiv({ cls: "dqc-mode-setting" });
		const isDaily = mode.target.type === "daily";
		const titleSetting = new Setting(box)
			.setName(`Mode ${index + 1}`)
			.setDesc(isDaily ? "Title of the capture screen." : "Name of this group of files, e.g. Books. Shown only here.")
			.addText((text) =>
				text
					.setPlaceholder(isDaily ? "Today's date" : "Name")
					.setValue(mode.title)
					.onChange(async (value) => {
						mode.title = value;
						await this.host.saveSettings();
					}),
			);
		if (this.settings.modes.length > 1) {
			titleSetting.addExtraButton((button) =>
				button
					.setIcon("trash-2")
					.setTooltip("Delete mode")
					.onClick(async () => {
						this.settings.modes.splice(index, 1);
						await this.saveAndRedraw();
					}),
			);
		}

		const hasFiles = mode.target.type === "files" && mode.target.files.some((file) => file.path.trim() !== "");
		new Setting(box)
			.setName("Writes to")
			.setDesc(hasFiles ? "Remove the files below to switch to the daily note." : "")
			.addDropdown((dropdown) =>
				dropdown
					.setDisabled(hasFiles)
					.addOptions({ daily: "Daily note", files: "Files" })
					.setValue(mode.target.type)
					.onChange(async (value) => {
						mode.target = value === "daily" ? { type: "daily" } : { type: "files", files: [emptyFile()] };
						await this.saveAndRedraw();
					}),
			);
		const target = mode.target;
		if (target.type === "files") {
			const hint = () =>
				listDestinations([mode], "").length === 0
					? "Add a file to see this mode on the capture screen."
					: "Each file shows up on the capture screen by its alias, or by its name when the alias is empty.";
			const addFile = new Setting(box);
			const refreshHint = () => addFile.setDesc(hint());
			target.files.forEach((file, fileIndex) => this.fileSetting(box, target.files, file, fileIndex, refreshHint));
			box.appendChild(addFile.settingEl);
			refreshHint();
			addFile.addButton((button) =>
				button.setButtonText("Add file").onClick(async () => {
					target.files.push(emptyFile());
					await this.saveAndRedraw();
				}),
			);
		}

		this.overrideText(box, FORMAT_FIELDS[0], mode.overrides);
		this.headingLevelOverride(box, mode.overrides);
		for (const field of FORMAT_FIELDS.slice(1)) this.overrideText(box, field, mode.overrides);

		this.settings.tagGroups.forEach((group, groupIndex) => {
			new Setting(box).setName(`Tags: ${group.name.trim() || `Group ${groupIndex + 1}`}`).addToggle((toggle) =>
				toggle.setValue(mode.tagGroupIds.includes(group.id)).onChange(async (on) => {
					mode.tagGroupIds = this.settings.tagGroups
						.map((g) => g.id)
						.filter((id) => (id === group.id ? on : mode.tagGroupIds.includes(id)));
					await this.host.saveSettings();
				}),
			);
		});
	}

	private fileSetting(container: HTMLElement, files: ModeFile[], file: ModeFile, index: number, onPathChange: () => void): void {
		const setting = new Setting(container).setName(`File ${index + 1}`).setClass("dqc-file-setting");
		let aliasInput: HTMLInputElement | null = null;
		const aliasPlaceholder = () => noteName(file.path) || "Alias";
		setting
			.addText((text) => {
				aliasInput = text.inputEl;
				text
					.setPlaceholder(aliasPlaceholder())
					.setValue(file.alias)
					.onChange(async (value) => {
						file.alias = value;
						await this.host.saveSettings();
					});
			})
			.addText((text) => {
				const savePath = async (value: string) => {
					file.path = value;
					aliasInput?.setAttribute("placeholder", aliasPlaceholder());
					onPathChange();
					await this.host.saveSettings();
				};
				text.setPlaceholder("Books/Book.md").setValue(file.path).onChange(savePath);
				new FileSuggest(this.app, text.inputEl, (path) => void savePath(path));
			})
			.addExtraButton((button) =>
				button
					.setIcon("trash-2")
					.setTooltip("Remove file from this mode")
					.onClick(async () => {
						files.splice(index, 1);
						await this.saveAndRedraw();
					}),
			);
	}

	private overrideText(container: HTMLElement, field: TextFormatField, overrides: FormatOverrides): void {
		const inherited = this.settings.defaults[field.key];
		new Setting(container).setName(field.name).addText((text) =>
			text
				.setPlaceholder(inherited === "" ? "Default: empty" : inherited)
				.setValue(overrides[field.key])
				.onChange(async (value) => {
					overrides[field.key] = value;
					await this.host.saveSettings();
				}),
		);
	}

	private headingLevelOverride(container: HTMLElement, overrides: FormatOverrides): void {
		const options: Record<string, string> = { default: `Default (H${this.settings.defaults.headingLevel})` };
		for (const level of LEVELS) options[String(level)] = `H${level}`;
		options.none = "No heading, end of note";
		new Setting(container).setName("Heading level").addDropdown((dropdown) =>
			dropdown
				.addOptions(options)
				.setValue(String(overrides.headingLevel))
				.onChange(async (value) => {
					overrides.headingLevel = parseLevelChoice(value);
					await this.host.saveSettings();
				}),
		);
	}

	private formatText(
		container: HTMLElement,
		field: TextFormatField,
		value: string,
		placeholder: string,
		save: (value: string) => void,
	): void {
		new Setting(container)
			.setName(field.name)
			.setDesc(field.description)
			.addText((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(value)
					.onChange(async (next) => {
						save(next);
						await this.host.saveSettings();
					}),
			);
	}

	private tagGroupSettings(): void {
		new Setting(this.containerEl)
			.setName("Quick tags")
			.setDesc("Tags you can add to an entry with the # button. They go right before the suffix. A tag with an icon shows the icon on the button and writes the tag. Turn groups on for each mode above.")
			.setHeading();
		this.host.settings.tagGroups.forEach((group, index) => this.tagGroupSetting(group, index));
		new Setting(this.containerEl).addButton((button) =>
			button.setButtonText("Add group").onClick(async () => {
				this.host.settings.tagGroups.push({ id: newId(), name: "", tags: [{ tag: "", icon: "" }] });
				await this.saveAndRedraw();
			}),
		);
	}

	private tagGroupSetting(group: TagGroup, index: number): void {
		new Setting(this.containerEl)
			.setName(`Group ${index + 1}`)
			.setClass("dqc-tag-group-setting")
			.addText((text) =>
				text
					.setPlaceholder("Name, e.g. Books")
					.setValue(group.name)
					.onChange(async (value) => {
						group.name = value;
						await this.host.saveSettings();
					}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("trash-2")
					.setTooltip("Delete group")
					.onClick(async () => {
						this.host.settings.tagGroups.splice(index, 1);
						for (const mode of this.host.settings.modes) {
							mode.tagGroupIds = mode.tagGroupIds.filter((id) => id !== group.id);
						}
						await this.saveAndRedraw();
					}),
			);

		group.tags.forEach((quickTag, tagIndex) => {
			const setting = new Setting(this.containerEl);
			const preview = setting.nameEl.createSpan({ cls: "dqc-tag-row-preview" });
			const updatePreview = () => renderTagLabel(preview, quickTag.tag, quickTag.icon);
			updatePreview();
			setting
				.addText((text) =>
					text
						.setPlaceholder("#tag")
						.setValue(quickTag.tag)
						.onChange(async (value) => {
							quickTag.tag = value;
							updatePreview();
							await this.host.saveSettings();
						}),
				)
				.addText((text) => {
					const saveIcon = async (value: string) => {
						quickTag.icon = value.trim();
						updatePreview();
						await this.host.saveSettings();
					};
					text.setPlaceholder("Icon (optional)").setValue(quickTag.icon).onChange(saveIcon);
					new IconSuggest(this.app, text.inputEl, (icon) => void saveIcon(icon));
				})
				.addExtraButton((button) =>
					button
						.setIcon("chevron-up")
						.setTooltip("Move up")
						.setDisabled(tagIndex === 0)
						.onClick(async () => {
							moveItem(group.tags, tagIndex, -1);
							await this.saveAndRedraw();
						}),
				)
				.addExtraButton((button) =>
					button
						.setIcon("chevron-down")
						.setTooltip("Move down")
						.setDisabled(tagIndex === group.tags.length - 1)
						.onClick(async () => {
							moveItem(group.tags, tagIndex, 1);
							await this.saveAndRedraw();
						}),
				)
				.addExtraButton((button) =>
					button
						.setIcon("x")
						.setTooltip("Remove tag")
						.onClick(async () => {
							group.tags.splice(tagIndex, 1);
							await this.saveAndRedraw();
						}),
				);
		});

		new Setting(this.containerEl).addButton((button) =>
			button.setButtonText("Add tag").onClick(async () => {
				group.tags.push({ tag: "", icon: "" });
				await this.saveAndRedraw();
			}),
		);
	}

	private async saveAndRedraw(): Promise<void> {
		await this.host.saveSettings();
		this.display();
	}
}

function emptyFile(): ModeFile {
	return { id: newId(), alias: "", path: "", lastUsedAt: 0 };
}

function parseLevelChoice(value: string): HeadingLevelChoice {
	return value === "default" || value === "none" ? value : Number(value);
}
