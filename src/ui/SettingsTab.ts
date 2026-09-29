import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { AfterSend, CaptureSettings } from "../settings";

export interface SettingsHost extends Plugin {
	settings: CaptureSettings;
	saveSettings(): Promise<void>;
}

type TextSettingKey = "heading" | "textPrefix" | "textSuffix" | "audioPrefix" | "audioSuffix";

const TIME_HINT = "{{time}} becomes the current time, e.g. 23:35. Spaces at the edges are kept.";

export class SettingsTab extends PluginSettingTab {
	constructor(app: App, private readonly host: SettingsHost) {
		super(app, host);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.textSetting("Heading", "Entries go to the end of this heading's section. If the note has no such heading, it is created at the end of the note: write \"### Journal\" to choose its level (default ##). Leave empty to add to the end of the note.", "heading", "Journal");

		new Setting(containerEl).setName("Text entries").setHeading();
		this.textSetting("Prefix", TIME_HINT, "textPrefix");
		this.textSetting("Suffix", TIME_HINT, "textSuffix");

		new Setting(containerEl).setName("Audio entries").setHeading();
		this.textSetting("Prefix", TIME_HINT, "audioPrefix");
		this.textSetting("Suffix", `${TIME_HINT} Useful for a tag, e.g. " #transcribe".`, "audioSuffix");
		new Setting(containerEl)
			.setName("Embed audio")
			.setDesc("On: ![[Recording.m4a]] shows a player. Off: [[Recording.m4a]] is a plain link.")
			.addToggle((toggle) =>
				toggle.setValue(this.host.settings.embedAudio).onChange(async (value) => {
					this.host.settings.embedAudio = value;
					await this.host.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Behavior").setHeading();
		new Setting(containerEl)
			.setName("After sending")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ close: "Close the screen", stay: "Stay for the next entry" })
					.setValue(this.host.settings.afterSend)
					.onChange(async (value) => {
						this.host.settings.afterSend = value as AfterSend;
						await this.host.saveSettings();
					}),
			);
	}

	private textSetting(name: string, description: string, key: TextSettingKey, placeholder = ""): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addText((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(this.host.settings[key])
					.onChange(async (value) => {
						this.host.settings[key] = value;
						await this.host.saveSettings();
					}),
			);
	}
}
