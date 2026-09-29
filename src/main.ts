import { Notice, Plugin } from "obsidian";
import { CaptureService } from "./application/CaptureService";
import { systemClock } from "./domain/Clock";
import { listDestinations, markUsed, pickDestination } from "./domain/CaptureMode";
import { MediaAudioRecorder } from "./infrastructure/MediaAudioRecorder";
import { ObsidianAttachments } from "./infrastructure/ObsidianAttachments";
import { ObsidianDailyNotes } from "./infrastructure/ObsidianDailyNotes";
import { ObsidianNoteTargets } from "./infrastructure/ObsidianNoteTargets";
import { ObsidianNoteWriter } from "./infrastructure/ObsidianNoteWriter";
import { CaptureSettings, loadSettings } from "./settings";
import { CaptureModal } from "./ui/CaptureModal";
import { NO_DESTINATIONS, todayTitle } from "./ui/CaptureScreen";
import { SettingsHost, SettingsTab } from "./ui/SettingsTab";

const DESTINATION_COMMAND_PREFIX = "capture-";

export default class QuickCapturePlugin extends Plugin implements SettingsHost {
	override settings: CaptureSettings = loadSettings(null);
	private openCapture: (destinationId: string, fallBackToFirst: boolean) => void = () => {};
	private destinationCommandIds: string[] = [];

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
		this.openCapture = (destinationId, fallBackToFirst) => {
			const destinations = listDestinations(this.settings.modes, todayTitle());
			const destination = fallBackToFirst
				? pickDestination(destinations, destinationId)
				: destinations.find((candidate) => candidate.id === destinationId);
			if (!destination) {
				new Notice(fallBackToFirst ? NO_DESTINATIONS : "This file is no longer in Quick Capture settings");
				return;
			}
			new CaptureModal(this.app, {
				service,
				createRecorder: () => new MediaAudioRecorder(),
				settings: () => this.settings,
				destination,
				onDestinationChange: (id) => {
					this.settings.lastDestinationId = id;
					void this.saveSettings();
				},
				onCaptured: (id) => {
					if (markUsed(this.settings.modes, id, Date.now())) void this.saveSettings();
				},
				linkSourcePath: (destination) => targets.previewPath(destination.target),
			}).open();
		};
		const openLast = () => this.openCapture(this.settings.lastDestinationId, true);

		this.addRibbonIcon("mic", "Open quick capture", openLast);
		this.addCommand({ id: "open", name: "Open quick capture", callback: openLast });
		this.syncDestinationCommands();
		this.addSettingTab(new SettingsTab(this.app, this));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.syncDestinationCommands();
	}

	private syncDestinationCommands(): void {
		for (const id of this.destinationCommandIds) this.removeCommandById(id);
		this.destinationCommandIds = listDestinations(this.settings.modes, "daily note").map((destination) => {
			const id = `${DESTINATION_COMMAND_PREFIX}${destination.id}`;
			this.addCommand({ id, name: `Capture to ${destination.title}`, callback: () => this.openCapture(destination.id, false) });
			return id;
		});
	}

	private removeCommandById(id: string): void {
		const remove = (this as Partial<Pick<Plugin, "removeCommand">>).removeCommand;
		if (remove) remove.call(this, id);
		else (this.app as unknown as { commands: { removeCommand(id: string): void } }).commands.removeCommand(`${this.manifest.id}:${id}`);
	}
}
