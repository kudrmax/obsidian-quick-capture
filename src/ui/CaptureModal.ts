import { App, Modal, Platform } from "obsidian";
import { CapturedEntry, CaptureService } from "../application/CaptureService";
import { Destination } from "../domain/CaptureMode";
import { AudioPlayer } from "../infrastructure/HtmlAudioPlayer";
import { AudioRecorder } from "../infrastructure/MediaAudioRecorder";
import { CaptureSettings } from "../settings";
import { CaptureScreen } from "./CaptureScreen";
import { CaptureSuggest } from "./CaptureSuggest";

export interface CaptureModalDependencies {
	service: CaptureService;
	createRecorder: () => AudioRecorder;
	createPlayer: () => AudioPlayer;
	settings: () => CaptureSettings;
	destination: Destination;
	today: string;
	onDestinationChange: (id: string) => void;
	onCaptured: (id: string) => void;
	openNote: (entry: CapturedEntry) => void;
	linkSourcePath: (destination: Destination) => string;
}

export class CaptureModal extends Modal {
	private screen: CaptureScreen | null = null;
	private closingConfirmed = false;

	constructor(app: App, private readonly deps: CaptureModalDependencies) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass("dqc-modal");
		this.containerEl.addClass("dqc-modal-container");
		this.screen = new CaptureScreen(this.contentEl, {
			service: this.deps.service,
			createRecorder: this.deps.createRecorder,
			createPlayer: this.deps.createPlayer,
			settings: this.deps.settings,
			initial: this.deps.destination,
			today: this.deps.today,
			onDestinationChange: this.deps.onDestinationChange,
			onCaptured: this.deps.onCaptured,
			openNote: this.deps.openNote,
			autoFocus: !Platform.isMobile || this.deps.settings().openKeyboardOnMobile,
			decorateTextInput: (textarea, destination) =>
				new CaptureSuggest(this.app, textarea, () => this.deps.linkSourcePath(destination())),
			onClose: () => {
				this.closingConfirmed = true;
				this.close();
			},
		});
		this.scope.register(["Mod"], "Enter", (event) => {
			event.preventDefault();
			this.screen?.submit();
			return false;
		});
		this.screen.focus();
		window.setTimeout(() => this.screen?.focus(), 50);
	}

	override close(): void {
		if (this.closingConfirmed || !this.screen) super.close();
		else this.screen.requestClose();
	}

	override onClose(): void {
		this.screen?.destroy();
		this.contentEl.empty();
	}
}
