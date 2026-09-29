import { App, Modal, Platform } from "obsidian";
import { CaptureService } from "../application/CaptureService";
import { Destination } from "../domain/CaptureMode";
import { AudioRecorder } from "../infrastructure/MediaAudioRecorder";
import { CaptureSettings } from "../settings";
import { CaptureScreen } from "./CaptureScreen";
import { CaptureSuggest } from "./CaptureSuggest";

export interface CaptureModalDependencies {
	service: CaptureService;
	createRecorder: () => AudioRecorder;
	settings: () => CaptureSettings;
	destination: Destination;
	onDestinationChange: (id: string) => void;
	onCaptured: (id: string) => void;
	linkSourcePath: (destination: Destination) => string;
}

export class CaptureModal extends Modal {
	private screen: CaptureScreen | null = null;
	private closingConfirmed = false;
	private readonly onKeyboardShow = () => this.screen?.setKeyboardVisible(true);
	private readonly onKeyboardHide = () => this.screen?.setKeyboardVisible(false);

	constructor(app: App, private readonly deps: CaptureModalDependencies) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass("dqc-modal");
		this.containerEl.addClass("dqc-modal-container");
		this.screen = new CaptureScreen(this.contentEl, {
			service: this.deps.service,
			createRecorder: this.deps.createRecorder,
			settings: this.deps.settings,
			initial: this.deps.destination,
			onDestinationChange: this.deps.onDestinationChange,
			onCaptured: this.deps.onCaptured,
			autoFocus: !Platform.isMobile,
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
		window.addEventListener("keyboardWillShow", this.onKeyboardShow);
		window.addEventListener("keyboardWillHide", this.onKeyboardHide);
		window.setTimeout(() => this.screen?.focus(), 50);
	}

	override close(): void {
		if (this.closingConfirmed || !this.screen) super.close();
		else this.screen.requestClose();
	}

	override onClose(): void {
		window.removeEventListener("keyboardWillShow", this.onKeyboardShow);
		window.removeEventListener("keyboardWillHide", this.onKeyboardHide);
		this.screen?.destroy();
		this.contentEl.empty();
	}
}
