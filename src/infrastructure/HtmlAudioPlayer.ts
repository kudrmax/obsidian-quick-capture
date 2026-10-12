import { AudioRecording } from "../application/ports";
import { partOffsets } from "../domain/RecordingParts";

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

interface Track {
	audio: HTMLAudioElement;
	url: string;
	offsetMs: number;
}

export class HtmlAudioPlayer implements AudioPlayer {
	private tracks: Track[] = [];
	private index = 0;
	private loaded: AudioRecording | null = null;
	private onEnded: () => void = () => undefined;

	async play(recording: AudioRecording, onEnded: () => void): Promise<void> {
		this.load(recording);
		this.onEnded = onEnded;
		await this.current()?.audio.play();
	}

	pause(): void {
		this.current()?.audio.pause();
	}

	isPlaying(): boolean {
		const track = this.current();
		return track !== undefined && !track.audio.paused;
	}

	positionMs(): number {
		const track = this.current();
		return track ? track.offsetMs + track.audio.currentTime * 1000 : 0;
	}

	release(): void {
		for (const track of this.tracks) {
			track.audio.pause();
			URL.revokeObjectURL(track.url);
		}
		this.tracks = [];
		this.index = 0;
		this.loaded = null;
	}

	private current(): Track | undefined {
		return this.tracks[this.index];
	}

	private load(recording: AudioRecording): void {
		if (this.loaded === recording) return;
		this.release();
		const type = mimeTypeFor(recording.extension);
		const offsets = partOffsets(recording.parts.map((part) => part.durationMs));
		this.tracks = recording.parts.map((part, index) => {
			const url = URL.createObjectURL(new Blob([part.data], { type }));
			const audio = new Audio(url);
			audio.setAttribute("playsinline", "");
			audio.onended = () => this.advance(index);
			return { audio, url, offsetMs: offsets[index] };
		});
		this.loaded = recording;
	}

	private advance(finishedIndex: number): void {
		if (finishedIndex < this.tracks.length - 1) {
			this.index = finishedIndex + 1;
			void this.tracks[this.index].audio.play().catch(() => this.finish());
			return;
		}
		this.finish();
	}

	private finish(): void {
		for (const track of this.tracks) track.audio.currentTime = 0;
		this.index = 0;
		this.onEnded();
	}
}
