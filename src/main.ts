import { Notice, Plugin } from "obsidian";
import { CaptureService } from "./application/CaptureService";
import { systemClock } from "./domain/Clock";
import { DiaryDayClock } from "./domain/DiaryDayClock";
import { listDestinations, markUsed, movePaths, pickDestination } from "./domain/CaptureMode";
import { HtmlAudioPlayer } from "./infrastructure/HtmlAudioPlayer";
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

		const diaryClock = new DiaryDayClock(systemClock, () => this.settings.dayEndsAt);
		const dailyNotes = new ObsidianDailyNotes(this.app, diaryClock, (message) => new Notice(message));
		const targets = new ObsidianNoteTargets(this.app, dailyNotes, (message) => new Notice(message, 0));
		const service = new CaptureService({
			targets,
			notes: new ObsidianNoteWriter(this.app),
			attachments: new ObsidianAttachments(this.app),
			clock: systemClock,
			settings: () => this.settings,
		});
		this.openCapture = (destinationId, fallBackToFirst) => {
			const today = todayTitle(diaryClock.now());
			const destinations = listDestinations(this.settings.modes, today);
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
				createPlayer: () => new HtmlAudioPlayer(),
				settings: () => this.settings,
				destination,
				today,
				onDestinationChange: (id) => {
					this.settings.lastDestinationId = id;
					void this.saveSettings();
				},
				onCaptured: (id) => {
					if (markUsed(this.settings.modes, id, Date.now())) void this.saveSettings();
				},
				openNote: ({ path, line }) => void this.app.workspace.openLinkText(path, "", false, { eState: { line } }),
				linkSourcePath: (destination) => targets.previewPath(destination.target),
			}).open();
		};
		const openLast = () => this.openCapture(this.settings.lastDestinationId, true);

		this.addRibbonIcon("notebook-pen", "Open quick capture", openLast);
		this.addCommand({ id: "open", name: "Open quick capture", callback: openLast });
		this.syncDestinationCommands();
		this.addSettingTab(new SettingsTab(this.app, this));
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (movePaths(this.settings.modes, oldPath, file.path)) void this.saveSettings();
			}),
		);
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
