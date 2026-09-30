import { Notice, setIcon } from "obsidian";
import { CaptureError, CaptureService, TargetError } from "../application/CaptureService";
import { AudioRecording } from "../application/ports";
import { AudioPlayer, playbackProgress } from "../infrastructure/HtmlAudioPlayer";
import { AudioRecorder } from "../infrastructure/MediaAudioRecorder";
import { Destination, listDestinations, modeTagGroups, pickDestination, retainTags } from "../domain/CaptureMode";
import { highlightSegments } from "../domain/Highlight";
import { CaptureSettings } from "../settings";
import { ModePicker } from "./ModePicker";
import { SampleTicker } from "./SampleTicker";
import { hasQuickTags, TagPicker } from "./TagPicker";
import { Waveform } from "./Waveform";

export interface CaptureScreenOptions {
	service: CaptureService;
	createRecorder: () => AudioRecorder;
	createPlayer: () => AudioPlayer;
	settings: () => CaptureSettings;
	initial: Destination;
	onDestinationChange: (id: string) => void;
	onCaptured: (id: string) => void;
	autoFocus: boolean;
	decorateTextInput: (textarea: HTMLTextAreaElement, destination: () => Destination) => void;
	onClose: () => void;
}

type State = "input" | "starting" | "recording" | "paused" | "stopped" | "sending";

interface ControlSpec {
	icon: string;
	label: string;
	tone: "primary" | "danger" | "secondary";
	onClick: () => void;
	disabled?: boolean;
}

const SAMPLE_INTERVAL_MS = 60;

export const NO_DESTINATIONS = "Add a file in Quick Capture settings";

export function todayTitle(): string {
	return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
const SWIPE_DISTANCE_PX = 60;

export class CaptureScreen {
	private state: State = "input";
	private readonly root: HTMLElement;
	private readonly textarea: HTMLTextAreaElement;
	private readonly highlightEl: HTMLElement;
	private readonly bodyEl: HTMLElement;
	private readonly titleEl: HTMLElement;
	private readonly statusEl: HTMLElement;
	private readonly timerEl: HTMLElement;
	private readonly closeSlot: HTMLElement;
	private readonly tagSlot: HTMLElement;
	private readonly leftSlot: HTMLElement;
	private readonly centerSlot: HTMLElement;
	private readonly confirmEl: HTMLElement;
	private readonly playSlot: HTMLElement;
	private readonly player: AudioPlayer;
	private readonly waveform: Waveform;
	private readonly selectedTags = new Set<string>();
	private readonly tagPicker: TagPicker;
	private readonly modePicker: ModePicker;
	private readonly today = todayTitle();
	private current: Destination;
	private readonly footerObserver: ResizeObserver;

	private recorder: AudioRecorder | null = null;
	private pendingRecording: Promise<AudioRecording> | null = null;
	private sendingAudio = false;
	private destroyed = false;
	private sampleFrame: number | null = null;
	private readonly ticker = new SampleTicker(SAMPLE_INTERVAL_MS);
	private playbackTimer: number | null = null;
	private stoppedElapsedMs = 0;
	private touchStart: { x: number; y: number } | null = null;

	constructor(container: HTMLElement, private readonly options: CaptureScreenOptions) {
		this.current = options.initial;
		this.player = options.createPlayer();
		this.root = container.createDiv({ cls: "dqc-screen" });
		this.root.addEventListener("touchstart", (event) => this.onTouchStart(event), { passive: true });
		this.root.addEventListener("touchend", (event) => this.onTouchEnd(event), { passive: true });

		const body = this.root.createDiv({ cls: "dqc-body" });
		this.bodyEl = body;
		body.addEventListener("click", (event) => {
			if (this.state === "input" && event.target !== this.textarea) this.textarea.focus();
		});
		this.titleEl = body.createDiv({ cls: "dqc-title" });
		this.titleEl.addEventListener("click", (event) => {
			if (!this.titleEl.hasClass("is-switchable")) return;
			event.stopPropagation();
			this.toggleModePicker();
		});
		const editor = body.createDiv({ cls: "dqc-editor" });
		this.highlightEl = editor.createDiv({ cls: "dqc-highlight", attr: { "aria-hidden": "true" } });
		this.textarea = editor.createEl("textarea", { cls: "dqc-text", attr: { placeholder: "What's on your mind?", rows: "1" } });
		this.textarea.addEventListener("input", () => {
			this.renderText();
			this.renderControls();
		});
		this.textarea.addEventListener("scroll", () => (this.highlightEl.scrollTop = this.textarea.scrollTop));
		options.decorateTextInput(this.textarea, () => this.destination());

		const recorderView = body.createDiv({ cls: "dqc-recorder" });
		this.statusEl = recorderView.createDiv({ cls: "dqc-status" });
		this.timerEl = recorderView.createDiv({ cls: "dqc-timer", text: "00:00" });
		this.waveform = new Waveform(recorderView.createEl("canvas", { cls: "dqc-wave" }));
		this.playSlot = recorderView.createDiv({ cls: "dqc-slot dqc-slot-side dqc-slot-play" });

		const footer = this.root.createDiv({ cls: "dqc-footer" });
		const controls = footer.createDiv({ cls: "dqc-controls" });
		const start = controls.createDiv({ cls: "dqc-controls-side dqc-controls-start" });
		this.tagSlot = start.createDiv({ cls: "dqc-slot dqc-slot-side dqc-slot-tags" });
		this.leftSlot = start.createDiv({ cls: "dqc-slot dqc-slot-side" });
		this.centerSlot = controls.createDiv({ cls: "dqc-slot dqc-slot-center" });
		const end = controls.createDiv({ cls: "dqc-controls-side dqc-controls-end" });
		this.closeSlot = end.createDiv({ cls: "dqc-slot dqc-slot-side" });
		this.footerObserver = new ResizeObserver(() =>
			this.root.style.setProperty("--dqc-footer-height", `${footer.offsetHeight}px`),
		);
		this.footerObserver.observe(footer);

		this.tagPicker = new TagPicker(this.root, () => this.modeTagGroups(), this.selectedTags, () => this.renderControls());
		this.modePicker = new ModePicker(
			this.root,
			this.titleEl,
			() => this.destinations(),
			() => this.destination().id,
			(id) => this.switchDestination(id),
			() => this.renderTitle(),
		);
		this.confirmEl = this.root.createDiv({ cls: "dqc-confirm" });
		this.render();
	}

	focus(): void {
		if (this.options.autoFocus && this.state === "input") this.textarea.focus();
	}

	setKeyboardVisible(visible: boolean): void {
		this.root.toggleClass("is-keyboard-visible", visible);
		this.modePicker.reposition();
	}

	submit(): void {
		const canSendText = this.state === "input" && this.textarea.value.trim() !== "";
		if (canSendText || this.state === "stopped") void this.send();
	}

	requestClose(): void {
		if (this.state === "sending") return;
		if (this.tagPicker.isOpen()) this.tagPicker.close();
		else if (this.modePicker.isOpen()) this.modePicker.close();
		else if (this.hasUnsentAudio()) this.showConfirm();
		else this.options.onClose();
	}

	destroy(): void {
		this.destroyed = true;
		this.footerObserver.disconnect();
		this.modePicker.destroy();
		this.releaseRecorder();
	}

	private destinations(): Destination[] {
		return listDestinations(this.options.settings().modes, this.today);
	}

	private destination(): Destination {
		const destinations = this.destinations();
		const current = destinations.find((destination) => destination.id === this.current.id);
		if (current) this.current = current;
		else if (destinations.length > 0) this.moveTo(destinations[0]);
		return this.current;
	}

	private isAvailable(destination: Destination): boolean {
		return this.destinations().some((candidate) => candidate.id === destination.id);
	}

	private moveTo(destination: Destination): void {
		this.current = destination;
		const kept = retainTags(this.selectedTags, this.modeTagGroups());
		this.selectedTags.clear();
		kept.forEach((tag) => this.selectedTags.add(tag));
		this.options.onDestinationChange(destination.id);
	}

	private modeTagGroups() {
		return modeTagGroups(this.options.settings().tagGroups, this.destination().mode);
	}

	private switchDestination(id: string): void {
		const destination = pickDestination(this.destinations(), id);
		if (!destination) return;
		this.moveTo(destination);
		this.renderTitle();
		this.renderControls();
	}

	private hasUnsentAudio(): boolean {
		return this.state === "recording" || this.state === "paused" || this.state === "stopped";
	}

	private isStarting(): boolean {
		return this.state === "starting";
	}

	private isAudioMode(): boolean {
		return this.state === "starting" || this.hasUnsentAudio() || (this.state === "sending" && this.sendingAudio);
	}

	private async startRecording(): Promise<void> {
		if (this.state !== "input") return;
		this.textarea.blur();
		this.stoppedElapsedMs = 0;
		this.waveform.clear();
		this.setState("starting");
		const recorder = this.options.createRecorder();
		try {
			await nextFrame();
			await recorder.start();
		} catch (error) {
			recorder.cancel();
			if (this.destroyed) return;
			new Notice(`Microphone is not available: ${errorMessage(error)}`);
			this.setState("input");
			return;
		}
		if (this.destroyed || !this.isStarting()) {
			recorder.cancel();
			return;
		}
		this.recorder = recorder;
		this.setState("recording");
		this.startSampling();
	}

	private pause(): void {
		this.recorder?.pause();
		this.stopSampling();
		this.setState("paused");
	}

	private resume(): void {
		this.recorder?.resume();
		this.setState("recording");
		this.startSampling();
	}

	private stop(): void {
		const recorder = this.recorder;
		if (!recorder) return;
		this.stopSampling();
		this.stoppedElapsedMs = recorder.elapsedMs();
		this.recorder = null;
		this.pendingRecording = nextFrame().then(() => recorder.stop());
		this.pendingRecording.catch(() => undefined);
		this.setState("stopped");
	}

	private discard(): void {
		this.releaseRecorder();
		this.stoppedElapsedMs = 0;
		this.waveform.clear();
		this.setState("input");
		this.focus();
	}

	private releaseRecorder(): void {
		this.stopPlayback();
		this.player.release();
		this.stopSampling();
		this.recorder?.cancel();
		this.recorder = null;
		this.pendingRecording = null;
	}

	private async send(): Promise<void> {
		const previous = this.state;
		const tags = [...this.selectedTags];
		const destination = this.destination();
		if (!this.isAvailable(destination)) {
			new Notice(NO_DESTINATIONS);
			return;
		}
		this.sendingAudio = previous === "stopped";
		this.stopPlayback();
		this.tagPicker.close();
		this.modePicker.close();
		this.setState("sending");
		try {
			if (this.sendingAudio) await this.options.service.captureAudio(destination, await this.requirePendingRecording(), tags);
			else await this.options.service.captureText(destination, this.textarea.value, tags);
		} catch (error) {
			if (error instanceof TargetError) {
				new Notice(error.message);
				this.setState(previous);
				return;
			}
			if (this.sendingAudio && error instanceof CaptureError) {
				new Notice(error.message);
				this.discard();
				return;
			}
			new Notice(`Could not add: ${errorMessage(error)}`);
			this.setState(previous);
			return;
		}
		this.options.onCaptured(destination.id);
		new Notice(`Added to ${destination.title}`);
		this.resetAfterSend();
	}

	private requirePendingRecording(): Promise<AudioRecording> {
		if (!this.pendingRecording) return Promise.reject(new Error("no recording"));
		return this.pendingRecording;
	}

	private resetAfterSend(): void {
		this.player.release();
		this.pendingRecording = null;
		this.selectedTags.clear();
		this.textarea.value = "";
		this.stoppedElapsedMs = 0;
		this.waveform.clear();
		this.state = "input";
		if (this.options.settings().afterSend === "close") {
			this.options.onClose();
			return;
		}
		this.render();
		this.focus();
	}

	private async togglePlayback(): Promise<void> {
		if (this.isPlaying()) {
			this.stopPlayback();
			return;
		}
		try {
			await this.player.play(await this.requirePendingRecording(), () => this.stopPlayback());
		} catch (error) {
			new Notice(`Could not play the recording: ${errorMessage(error)}`);
			return;
		}
		if (this.state !== "stopped") {
			this.player.pause();
			return;
		}
		this.playbackTimer = window.setInterval(() => this.renderPlayback(), SAMPLE_INTERVAL_MS);
		this.render();
	}

	private stopPlayback(): void {
		this.player.pause();
		if (this.playbackTimer !== null) window.clearInterval(this.playbackTimer);
		this.playbackTimer = null;
		if (this.state === "stopped") this.render();
	}

	private isPlaying(): boolean {
		return this.playbackTimer !== null;
	}

	private renderPlayback(): void {
		this.renderTimer();
		this.drawWaveform();
	}

	private drawWaveform(): void {
		if (this.state !== "stopped") this.waveform.draw();
		else this.waveform.draw(playbackProgress(this.player.positionMs(), this.stoppedElapsedMs));
	}

	private startSampling(): void {
		this.stopSampling();
		this.ticker.start(performance.now());
		const frame = (now: number) => {
			const { samples, fraction } = this.ticker.tick(now);
			for (let i = 0; i < samples; i++) this.waveform.push(this.recorder?.level() ?? 0);
			this.waveform.draw(null, fraction);
			if (samples > 0) this.renderTimer();
			this.sampleFrame = window.requestAnimationFrame(frame);
		};
		this.sampleFrame = window.requestAnimationFrame(frame);
	}

	private stopSampling(): void {
		if (this.sampleFrame !== null) window.cancelAnimationFrame(this.sampleFrame);
		this.sampleFrame = null;
	}

	private currentElapsedMs(): number {
		const played = this.state === "stopped" ? this.player.positionMs() : 0;
		if (played > 0) return Math.min(played, this.stoppedElapsedMs);
		return this.recorder?.elapsedMs() ?? this.stoppedElapsedMs;
	}

	private onTouchStart(event: TouchEvent): void {
		const touch = event.touches[0];
		this.touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
	}

	private onTouchEnd(event: TouchEvent): void {
		const touch = event.changedTouches[0];
		if (!this.touchStart || !touch) return;
		const dx = touch.clientX - this.touchStart.x;
		const dy = touch.clientY - this.touchStart.y;
		this.touchStart = null;
		if (dy >= SWIPE_DISTANCE_PX && Math.abs(dy) > Math.abs(dx) && document.activeElement === this.textarea) {
			this.textarea.blur();
		}
	}

	private renderText(): void {
		this.highlightEl.empty();
		for (const segment of highlightSegments(this.textarea.value)) {
			if (segment.kind === "plain") this.highlightEl.appendText(segment.text);
			else this.highlightEl.createSpan({ cls: `dqc-hl-${segment.kind}`, text: segment.text });
		}
		this.highlightEl.appendText("\u200b");
		this.textarea.style.height = "auto";
		this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, this.availableTextHeight())}px`;
		this.highlightEl.scrollTop = this.textarea.scrollTop;
	}

	private availableTextHeight(): number {
		const style = getComputedStyle(this.bodyEl);
		const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
		const title = this.titleEl.offsetHeight + parseFloat(getComputedStyle(this.titleEl).marginBottom);
		const available = this.bodyEl.clientHeight - padding - title;
		return available > 0 ? available : Number.POSITIVE_INFINITY;
	}

	private setState(state: State): void {
		this.state = state;
		this.render();
	}

	private render(): void {
		this.root.dataset.state = this.state;
		this.root.dataset.mode = this.isAudioMode() ? "audio" : "text";
		this.root.toggleClass("is-playing", this.isPlaying());
		this.textarea.readOnly = this.state === "sending";
		this.renderTitle();
		if (!this.isAudioMode()) this.renderText();
		this.statusEl.setText(
			{
				input: "",
				starting: "Starting",
				recording: "Recording",
				paused: "Paused",
				stopped: this.isPlaying() ? "Playing" : "Ready to send",
				sending: "Sending",
			}[this.state],
		);
		this.renderTimer();
		this.renderControls();
		window.requestAnimationFrame(() => this.drawWaveform());
	}

	private renderTitle(): void {
		const switchable = this.destinations().length > 1;
		this.titleEl.empty();
		this.titleEl.appendText(this.destination().title);
		this.titleEl.toggleClass("is-switchable", switchable);
		if (switchable) {
			this.titleEl.appendText("\u00a0");
			setIcon(this.titleEl.createSpan({ cls: "dqc-title-chevron" }), "chevron-down");
			this.titleEl.setAttribute("role", "button");
			this.titleEl.setAttribute("aria-label", "Change mode");
		} else {
			this.titleEl.removeAttribute("role");
			this.titleEl.removeAttribute("aria-label");
		}
		this.titleEl.toggleClass("is-open", this.modePicker?.isOpen() ?? false);
	}

	private renderTimer(): void {
		const totalSeconds = Math.floor(this.currentElapsedMs() / 1000);
		const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
		const seconds = String(totalSeconds % 60).padStart(2, "0");
		this.timerEl.setText(`${minutes}:${seconds}`);
	}

	private renderControls(): void {
		const [left, center] = this.controlsForState();
		this.renderControl(this.closeSlot, {
			icon: "x",
			label: "Close",
			tone: "secondary",
			onClick: () => this.requestClose(),
			disabled: this.state === "sending",
		});
		this.renderTagControl();
		this.renderControl(this.leftSlot, left);
		this.renderControl(this.centerSlot, center);
		this.renderControl(
			this.playSlot,
			this.state === "stopped"
				? {
						icon: this.isPlaying() ? "pause" : "play",
						label: this.isPlaying() ? "Pause playback" : "Listen",
						tone: "secondary",
						onClick: () => void this.togglePlayback(),
					}
				: null,
		);
	}

	private renderTagControl(): void {
		if (!hasQuickTags(this.modeTagGroups())) {
			this.renderControl(this.tagSlot, null);
			return;
		}
		const count = this.selectedTags.size;
		this.renderControl(this.tagSlot, {
			icon: this.tagPicker.isOpen() ? "chevron-down" : "hash",
			label: count > 0 ? `Tags (${count})` : "Tags",
			tone: "secondary",
			onClick: () => this.toggleTagPicker(),
			disabled: this.state === "sending",
		});
		const button = this.tagSlot.querySelector("button");
		if (!button) return;
		if (count > 0) button.dataset.count = String(count);
		else delete button.dataset.count;
	}

	private toggleTagPicker(): void {
		this.modePicker.close();
		this.tagPicker.toggle();
		if (this.tagPicker.isOpen()) this.textarea.blur();
	}

	private toggleModePicker(): void {
		this.tagPicker.close();
		if (!this.modePicker.isOpen()) this.textarea.blur();
		this.modePicker.toggle();
	}

	private controlsForState(): [ControlSpec | null, ControlSpec] {
		switch (this.state) {
			case "input":
				return this.textarea.value.trim().length > 0
					? [null, { icon: "arrow-up", label: "Send", tone: "primary", onClick: () => void this.send() }]
					: [
							null,
							{
								icon: "mic",
								label: "Record",
								tone: "primary",
								onClick: () => void this.startRecording(),
							},
						];
			case "starting":
				return [
					{ icon: "pause", label: "Pause", tone: "secondary", onClick: () => {}, disabled: true },
					{ icon: "square", label: "Stop", tone: "danger", onClick: () => {}, disabled: true },
				];
			case "recording":
				return [
					{ icon: "pause", label: "Pause", tone: "secondary", onClick: () => this.pause() },
					{ icon: "square", label: "Stop", tone: "danger", onClick: () => this.stop() },
				];
			case "paused":
				return [
					{ icon: "play", label: "Resume", tone: "secondary", onClick: () => this.resume() },
					{ icon: "square", label: "Stop", tone: "danger", onClick: () => this.stop() },
				];
			case "stopped":
				return [
					{ icon: "trash-2", label: "Discard", tone: "secondary", onClick: () => this.discard() },
					{ icon: "arrow-up", label: "Send", tone: "primary", onClick: () => void this.send() },
				];
			case "sending":
				return [null, { icon: "loader", label: "Sending", tone: "primary", onClick: () => {}, disabled: true }];
		}
	}

	private renderControl(slot: HTMLElement, spec: ControlSpec | null): void {
		if (!spec) {
			slot.empty();
			return;
		}
		const button = slot.querySelector("button") ?? slot.createEl("button");
		button.className = `dqc-control dqc-${spec.tone}`;
		button.setAttribute("aria-label", spec.label);
		button.setAttribute("title", spec.label);
		if (button.dataset.icon !== spec.icon) {
			button.empty();
			setIcon(button, spec.icon);
			button.dataset.icon = spec.icon;
		}
		button.disabled = spec.disabled ?? false;
		button.onclick = spec.onClick;
	}

	private showConfirm(): void {
		this.confirmEl.empty();
		const sheet = this.confirmEl.createDiv({ cls: "dqc-confirm-sheet" });
		sheet.createDiv({ cls: "dqc-confirm-title", text: "Discard recording?" });
		sheet.createDiv({ cls: "dqc-confirm-text", text: "It hasn't been added yet." });
		const actions = sheet.createDiv({ cls: "dqc-confirm-actions" });
		const keep = actions.createEl("button", { cls: "dqc-pill", text: "Keep" });
		keep.onclick = () => this.confirmEl.removeClass("is-open");
		const drop = actions.createEl("button", { cls: "dqc-pill dqc-pill-danger", text: "Discard" });
		drop.onclick = () => {
			this.confirmEl.removeClass("is-open");
			this.discard();
			this.options.onClose();
		};
		this.confirmEl.addClass("is-open");
	}
}

function nextFrame(): Promise<void> {
	return new Promise((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
