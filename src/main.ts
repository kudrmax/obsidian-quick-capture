import { Notice, Plugin } from "obsidian";
import { CaptureService } from "./application/CaptureService";
import { systemClock } from "./domain/Clock";
import { MediaAudioRecorder } from "./infrastructure/MediaAudioRecorder";
import { ObsidianAttachments } from "./infrastructure/ObsidianAttachments";
import { ObsidianDailyNotes } from "./infrastructure/ObsidianDailyNotes";
import { ObsidianNoteTargets } from "./infrastructure/ObsidianNoteTargets";
import { ObsidianNoteWriter } from "./infrastructure/ObsidianNoteWriter";
import { CaptureSettings, loadSettings } from "./settings";
import { CaptureModal } from "./ui/CaptureModal";
import { SettingsHost, SettingsTab } from "./ui/SettingsTab";

export default class DailyQuickCapturePlugin extends Plugin implements SettingsHost {
	override settings: CaptureSettings = loadSettings(null);

	override async onload(): Promise<void> {
		this.settings = loadSettings(await this.loadData());

		const dailyNotes = new ObsidianDailyNotes(this.app, systemClock, (message) => new Notice(message));
		const targets = new ObsidianNoteTargets(this.app, dailyNotes);
		const service = new CaptureService({
			targets,
			notes: new ObsidianNoteWriter(this.app),
			attachments: new ObsidianAttachments(this.app),
			clock: systemClock,
			settings: () => this.settings,
		});
		const openCapture = () =>
			new CaptureModal(this.app, {
				service,
				createRecorder: () => new MediaAudioRecorder(),
				settings: () => this.settings,
				modeId: this.settings.lastModeId,
				onModeChange: (id) => {
					this.settings.lastModeId = id;
					void this.saveSettings();
				},
				linkSourcePath: (mode) => targets.previewPath(mode.target),
			}).open();

		this.addRibbonIcon("mic", "Open quick capture", openCapture);
		this.addCommand({ id: "open", name: "Open quick capture", callback: openCapture });
		this.addSettingTab(new SettingsTab(this.app, this));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
