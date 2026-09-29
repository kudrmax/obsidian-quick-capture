import { Notice, setIcon } from "obsidian";
import { CaptureError, CaptureService } from "../application/CaptureService";
import { AudioRecording } from "../application/ports";
import { AudioRecorder } from "../infrastructure/MediaAudioRecorder";
import { highlightSegments } from "../domain/Highlight";
import { CaptureSettings } from "../settings";
import { Waveform } from "./Waveform";

export interface CaptureScreenOptions {
	service: CaptureService;
	createRecorder: () => AudioRecorder;
	settings: () => CaptureSettings;
	autoFocus: boolean;
	decorateTextInput: (textarea: HTMLTextAreaElement) => void;
	onClose: () => void;
}

type State = "input" | "recording" | "paused" | "stopped" | "sending";

interface ControlSpec {
	icon: string;
	label: string;
	tone: "primary" | "danger" | "secondary";
	onClick: () => void;
	disabled?: boolean;
}

const SAMPLE_INTERVAL_MS = 60;
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
	private readonly leftSlot: HTMLElement;
	private readonly centerSlot: HTMLElement;
	private readonly confirmEl: HTMLElement;
	private readonly waveform: Waveform;
	private readonly footerObserver: ResizeObserver;

	private recorder: AudioRecorder | null = null;
	private pendingRecording: Promise<AudioRecording> | null = null;
	private sendingAudio = false;
	private startingRecording = false;
	private destroyed = false;
	private sampleTimer: number | null = null;
	private elapsedMs = 0;
	private segmentStartedAt = 0;
	private touchStart: { x: number; y: number } | null = null;

	constructor(container: HTMLElement, private readonly options: CaptureScreenOptions) {
		this.root = container.createDiv({ cls: "dqc-screen" });
		this.root.addEventListener("touchstart", (event) => this.onTouchStart(event), { passive: true });
		this.root.addEventListener("touchend", (event) => this.onTouchEnd(event), { passive: true });

		const body = this.root.createDiv({ cls: "dqc-body" });
		this.bodyEl = body;
		body.addEventListener("click", (event) => {
			if (this.state === "input" && event.target !== this.textarea) this.textarea.focus();
		});
		this.titleEl = body.createDiv({
			cls: "dqc-title",
			text: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
		});
		const editor = body.createDiv({ cls: "dqc-editor" });
		this.highlightEl = editor.createDiv({ cls: "dqc-highlight", attr: { "aria-hidden": "true" } });
		this.textarea = editor.createEl("textarea", { cls: "dqc-text", attr: { placeholder: "What's on your mind?", rows: "1" } });
		this.textarea.addEventListener("input", () => {
			this.renderText();
			this.renderControls();
		});
		this.textarea.addEventListener("scroll", () => (this.highlightEl.scrollTop = this.textarea.scrollTop));
		options.decorateTextInput(this.textarea);

		const recorderView = body.createDiv({ cls: "dqc-recorder" });
		this.statusEl = recorderView.createDiv({ cls: "dqc-status" });
		this.timerEl = recorderView.createDiv({ cls: "dqc-timer", text: "00:00" });
		this.waveform = new Waveform(recorderView.createEl("canvas", { cls: "dqc-wave" }));

		const footer = this.root.createDiv({ cls: "dqc-footer" });
		const controls = footer.createDiv({ cls: "dqc-controls" });
		this.closeSlot = controls.createDiv({ cls: "dqc-slot dqc-slot-side" });
		this.leftSlot = controls.createDiv({ cls: "dqc-slot dqc-slot-side" });
		this.centerSlot = controls.createDiv({ cls: "dqc-slot dqc-slot-center" });
		this.footerObserver = new ResizeObserver(() =>
			this.root.style.setProperty("--dqc-footer-height", `${footer.offsetHeight}px`),
		);
		this.footerObserver.observe(footer);

		this.confirmEl = this.root.createDiv({ cls: "dqc-confirm" });
		this.render();
	}

	focus(): void {
		if (this.options.autoFocus && this.state === "input") this.textarea.focus();
	}

	setKeyboardVisible(visible: boolean): void {
		this.root.toggleClass("is-keyboard-visible", visible);
	}

	submit(): void {
		const canSendText = this.state === "input" && this.textarea.value.trim() !== "";
		if (canSendText || this.state === "stopped") void this.send();
	}

	requestClose(): void {
		if (this.state === "sending") return;
		if (this.hasUnsentAudio()) this.showConfirm();
		else this.options.onClose();
	}

	destroy(): void {
		this.destroyed = true;
		this.footerObserver.disconnect();
		this.releaseRecorder();
	}

	private hasUnsentAudio(): boolean {
		return this.state === "recording" || this.state === "paused" || this.state === "stopped";
	}

	private isAudioMode(): boolean {
		return this.hasUnsentAudio() || (this.state === "sending" && this.sendingAudio);
	}

	private async startRecording(): Promise<void> {
		if (this.startingRecording) return;
		this.startingRecording = true;
		this.renderControls();
		const recorder = this.options.createRecorder();
		try {
			await recorder.start();
		} catch (error) {
			recorder.cancel();
			if (!this.destroyed) new Notice(`Microphone is not available: ${errorMessage(error)}`);
			return;
		} finally {
			this.startingRecording = false;
		}
		if (this.destroyed || this.state !== "input") {
			recorder.cancel();
			return;
		}
		this.recorder = recorder;
		this.textarea.blur();
		this.elapsedMs = 0;
		this.waveform.clear();
		this.setState("recording");
		this.resumeSegment();
	}

	private pause(): void {
		this.recorder?.pause();
		this.closeSegment();
		this.setState("paused");
	}

	private resume(): void {
		this.recorder?.resume();
		this.setState("recording");
		this.resumeSegment();
	}

	private stop(): void {
		if (this.state === "recording") this.closeSegment();
		this.pendingRecording = this.recorder?.stop() ?? null;
		this.pendingRecording?.catch(() => undefined);
		this.recorder = null;
		this.setState("stopped");
	}

	private discard(): void {
		this.releaseRecorder();
		this.elapsedMs = 0;
		this.waveform.clear();
		this.setState("input");
		this.focus();
	}

	private releaseRecorder(): void {
		this.stopSampling();
		this.recorder?.cancel();
		this.recorder = null;
		this.pendingRecording = null;
	}

	private async send(): Promise<void> {
		const previous = this.state;
		this.sendingAudio = previous === "stopped";
		this.setState("sending");
		try {
			if (this.sendingAudio) await this.options.service.captureAudio(await this.requirePendingRecording());
			else await this.options.service.captureText(this.textarea.value);
		} catch (error) {
			if (this.sendingAudio && error instanceof CaptureError) {
				new Notice(error.message);
				this.discard();
				return;
			}
			new Notice(`Could not add to daily note: ${errorMessage(error)}`);
			this.setState(previous);
			return;
		}
		new Notice("Added to daily note");
		this.resetAfterSend();
	}

	private requirePendingRecording(): Promise<AudioRecording> {
		if (!this.pendingRecording) return Promise.reject(new Error("no recording"));
		return this.pendingRecording;
	}

	private resetAfterSend(): void {
		this.pendingRecording = null;
		this.textarea.value = "";
		this.elapsedMs = 0;
		this.waveform.clear();
		this.state = "input";
		if (this.options.settings().afterSend === "close") {
			this.options.onClose();
			return;
		}
		this.render();
		this.focus();
	}

	private resumeSegment(): void {
		this.segmentStartedAt = performance.now();
		this.sampleTimer = window.setInterval(() => {
			this.waveform.push(this.recorder?.level() ?? 0);
			this.waveform.draw();
			this.renderTimer();
		}, SAMPLE_INTERVAL_MS);
	}

	private closeSegment(): void {
		this.elapsedMs += performance.now() - this.segmentStartedAt;
		this.stopSampling();
	}

	private stopSampling(): void {
		if (this.sampleTimer !== null) window.clearInterval(this.sampleTimer);
		this.sampleTimer = null;
	}

	private currentElapsedMs(): number {
		return this.state === "recording" ? this.elapsedMs + performance.now() - this.segmentStartedAt : this.elapsedMs;
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
		this.textarea.readOnly = this.state === "sending";
		if (!this.isAudioMode()) this.renderText();
		this.statusEl.setText(
			{ recording: "Recording", paused: "Paused", stopped: "Ready to send", sending: "Sending", input: "" }[this.state],
		);
		this.renderTimer();
		this.renderControls();
		window.requestAnimationFrame(() => this.waveform.draw());
	}

	private renderTimer(): void {
		const totalSeconds = Math.floor(this.currentElapsedMs() / 1000);
		const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
		const seconds = String(totalSeconds % 60).padStart(2, "0");
		this.timerEl.setText(`${minutes}:${seconds}`);
	}

	private renderControls(): void {
		const [left, center] = this.controlsForState();
		this.closeSlot.empty();
		this.leftSlot.empty();
		this.centerSlot.empty();
		this.createControl(this.closeSlot, {
			icon: "x",
			label: "Close",
			tone: "secondary",
			onClick: () => this.requestClose(),
			disabled: this.state === "sending",
		});
		if (left) this.createControl(this.leftSlot, left);
		this.createControl(this.centerSlot, center);
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
								disabled: this.startingRecording,
							},
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

	private createControl(parent: HTMLElement, spec: ControlSpec): HTMLButtonElement {
		const button = parent.createEl("button", {
			cls: `dqc-control dqc-${spec.tone}`,
			attr: { "aria-label": spec.label, title: spec.label },
		});
		setIcon(button, spec.icon);
		button.disabled = spec.disabled ?? false;
		button.onclick = spec.onClick;
		return button;
	}

	private showConfirm(): void {
		this.confirmEl.empty();
		const sheet = this.confirmEl.createDiv({ cls: "dqc-confirm-sheet" });
		sheet.createDiv({ cls: "dqc-confirm-title", text: "Discard recording?" });
		sheet.createDiv({ cls: "dqc-confirm-text", text: "It hasn't been added to your daily note yet." });
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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
