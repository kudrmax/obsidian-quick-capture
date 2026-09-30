import { AudioRecording } from "../application/ports";

export interface AudioPlayer {
	play(recording: AudioRecording, onEnded: () => void): Promise<void>;
	pause(): void;
	isPlaying(): boolean;
	positionMs(): number;
	release(): void;
}

export function mimeTypeFor(extension: string): string {
	if (extension === "m4a") return "audio/mp4";
	return `audio/${extension}`;
}

export function playbackProgress(positionMs: number, totalMs: number): number {
	if (totalMs <= 0) return 0;
	return Math.min(1, Math.max(0, positionMs / totalMs));
}

export class HtmlAudioPlayer implements AudioPlayer {
	private audio: HTMLAudioElement | null = null;
	private url: string | null = null;
	private loaded: AudioRecording | null = null;

	async play(recording: AudioRecording, onEnded: () => void): Promise<void> {
		const audio = this.load(recording);
		audio.onended = () => {
			audio.currentTime = 0;
			onEnded();
		};
		await audio.play();
	}

	pause(): void {
		this.audio?.pause();
	}

	isPlaying(): boolean {
		return this.audio !== null && !this.audio.paused;
	}

	positionMs(): number {
		return (this.audio?.currentTime ?? 0) * 1000;
	}

	release(): void {
		this.audio?.pause();
		if (this.url) URL.revokeObjectURL(this.url);
		this.audio = null;
		this.url = null;
		this.loaded = null;
	}

	private load(recording: AudioRecording): HTMLAudioElement {
		if (this.audio && this.loaded === recording) return this.audio;
		this.release();
		this.url = URL.createObjectURL(new Blob([recording.data], { type: mimeTypeFor(recording.extension) }));
		this.audio = new Audio(this.url);
		this.audio.setAttribute("playsinline", "");
		this.loaded = recording;
		return this.audio;
	}
}
