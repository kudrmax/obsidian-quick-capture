import { AudioRecording } from "../application/ports";

export interface AudioRecorder {
	start(): Promise<void>;
	pause(): void;
	resume(): void;
	stop(): Promise<AudioRecording>;
	cancel(): void;
	level(): number;
}

interface AudioFormat {
	mimeType: string;
	extension: string;
}

const PREFERRED_FORMATS: AudioFormat[] = [
	{ mimeType: "audio/mp4", extension: "m4a" },
	{ mimeType: "audio/webm;codecs=opus", extension: "webm" },
	{ mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
];

const CHUNK_INTERVAL_MS = 1000;

export class MediaAudioRecorder implements AudioRecorder {
	private stream: MediaStream | null = null;
	private recorder: MediaRecorder | null = null;
	private context: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private readonly samples = new Float32Array(1024);
	private chunks: Blob[] = [];
	private extension = "webm";
	private recordedMs = 0;
	private segmentStartedAt: number | null = null;

	async start(): Promise<void> {
		if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
			throw new Error("recording is not supported on this device");
		}
		this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		const format = PREFERRED_FORMATS.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType));
		this.recorder = new MediaRecorder(this.stream, format ? { mimeType: format.mimeType } : undefined);
		this.extension = format?.extension ?? extensionFor(this.recorder.mimeType);
		this.chunks = [];
		this.recorder.addEventListener("dataavailable", (event) => {
			if (event.data.size > 0) this.chunks.push(event.data);
		});
		this.startLevelMeter(this.stream);
		this.recorder.start(CHUNK_INTERVAL_MS);
		this.recordedMs = 0;
		this.segmentStartedAt = performance.now();
	}

	pause(): void {
		if (this.recorder?.state !== "recording") return;
		this.recorder.pause();
		this.closeSegment();
	}

	resume(): void {
		if (this.recorder?.state !== "paused") return;
		this.recorder.resume();
		this.segmentStartedAt = performance.now();
	}

	stop(): Promise<AudioRecording> {
		const recorder = this.recorder;
		if (!recorder) return Promise.reject(new Error("recording has not started"));
		this.closeSegment();
		const durationMs = this.recordedMs;
		return new Promise((resolve, reject) => {
			recorder.addEventListener(
				"stop",
				() => {
					const blob = new Blob(this.chunks, { type: recorder.mimeType });
					const extension = this.extension;
					this.release();
					blob.arrayBuffer().then((data) => resolve({ data, extension, durationMs }), reject);
				},
				{ once: true },
			);
			recorder.stop();
		});
	}

	cancel(): void {
		if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
		this.release();
	}

	level(): number {
		if (!this.analyser) return 0;
		this.analyser.getFloatTimeDomainData(this.samples);
		let sum = 0;
		for (const sample of this.samples) sum += sample * sample;
		const rms = Math.sqrt(sum / this.samples.length);
		return Math.min(1, Math.sqrt(rms) * 2.2);
	}

	private startLevelMeter(stream: MediaStream): void {
		this.context = new AudioContext();
		this.analyser = this.context.createAnalyser();
		this.analyser.fftSize = this.samples.length;
		this.context.createMediaStreamSource(stream).connect(this.analyser);
		void this.context.resume();
	}

	private closeSegment(): void {
		if (this.segmentStartedAt === null) return;
		this.recordedMs += performance.now() - this.segmentStartedAt;
		this.segmentStartedAt = null;
	}

	private release(): void {
		this.stream?.getTracks().forEach((track) => track.stop());
		void this.context?.close();
		this.stream = null;
		this.context = null;
		this.analyser = null;
		this.recorder = null;
		this.chunks = [];
	}
}

function extensionFor(mimeType: string): string {
	if (mimeType.includes("mp4")) return "m4a";
	if (mimeType.includes("ogg")) return "ogg";
	return "webm";
}
