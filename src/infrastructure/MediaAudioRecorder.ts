import { AudioPart, AudioRecording } from "../application/ports";
import { RecordingClock } from "../domain/RecordingClock";
import { MAX_PART_BYTES, PartSizeBudget } from "../domain/RecordingParts";

export interface AudioRecorder {
	start(): Promise<void>;
	pause(): void;
	resume(): void;
	stop(): Promise<AudioRecording>;
	cancel(): void;
	level(): number;
	elapsedMs(): number;
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

interface FinishedPart {
	blob: Promise<Blob>;
	durationMs: number;
}

class RecorderSegment {
	private readonly recorder: MediaRecorder;
	private readonly chunks: Blob[] = [];
	private readonly stopped: Promise<Blob>;

	constructor(stream: MediaStream, mimeType: string | undefined, onChunk: (segment: RecorderSegment, bytes: number) => void) {
		this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
		this.recorder.addEventListener("dataavailable", (event) => {
			if (event.data.size === 0) return;
			this.chunks.push(event.data);
			onChunk(this, event.data.size);
		});
		this.stopped = new Promise((resolve) => {
			this.recorder.addEventListener("stop", () => resolve(new Blob(this.chunks, { type: this.recorder.mimeType })), {
				once: true,
			});
		});
		this.recorder.start(CHUNK_INTERVAL_MS);
	}

	get mimeType(): string {
		return this.recorder.mimeType;
	}

	get state(): RecordingState {
		return this.recorder.state;
	}

	pause(): void {
		if (this.recorder.state === "recording") this.recorder.pause();
	}

	resume(): void {
		if (this.recorder.state === "paused") this.recorder.resume();
	}

	finish(): Promise<Blob> {
		if (this.recorder.state !== "inactive") this.recorder.stop();
		return this.stopped;
	}
}

/** Rolls over to a new file on the same stream before a part outgrows Obsidian Sync's file size limit. */
export class MediaAudioRecorder implements AudioRecorder {
	private stream: MediaStream | null = null;
	private segment: RecorderSegment | null = null;
	private mimeType: string | undefined;
	private finishedParts: FinishedPart[] = [];
	private partStartMs = 0;
	private readonly budget = new PartSizeBudget(MAX_PART_BYTES);
	private context: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private readonly samples = new Float32Array(1024);
	private extension = "webm";
	private readonly clock = new RecordingClock(() => performance.now());

	async start(): Promise<void> {
		if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
			throw new Error("recording is not supported on this device");
		}
		this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		const format = PREFERRED_FORMATS.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType));
		this.mimeType = format?.mimeType;
		this.finishedParts = [];
		this.partStartMs = 0;
		this.budget.reset();
		this.segment = this.startSegment(this.stream);
		this.extension = format?.extension ?? extensionFor(this.segment.mimeType);
		this.clock.start();
		const stream = this.stream;
		window.setTimeout(() => {
			if (this.stream === stream) this.startLevelMeter(stream);
		}, 0);
	}

	pause(): void {
		if (this.segment?.state !== "recording") return;
		this.segment.pause();
		this.clock.pause();
	}

	resume(): void {
		if (this.segment?.state !== "paused") return;
		this.segment.resume();
		this.clock.resume();
		this.rollOverIfFull();
	}

	async stop(): Promise<AudioRecording> {
		const segment = this.segment;
		if (!segment) throw new Error("recording has not started");
		this.clock.pause();
		const durationMs = this.clock.elapsedMs();
		const finished = [...this.finishedParts, { blob: segment.finish(), durationMs: durationMs - this.partStartMs }];
		try {
			const parts = await Promise.all(finished.map(toAudioPart));
			return { parts: parts.filter((part) => part.data.byteLength > 0), extension: this.extension, durationMs };
		} finally {
			this.release();
		}
	}

	cancel(): void {
		void this.segment?.finish();
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

	elapsedMs(): number {
		return this.clock.elapsedMs();
	}

	private startSegment(stream: MediaStream): RecorderSegment {
		return new RecorderSegment(stream, this.mimeType, (segment, bytes) => {
			if (segment !== this.segment) return;
			this.budget.add(bytes);
			this.rollOverIfFull();
		});
	}

	private rollOverIfFull(): void {
		const segment = this.segment;
		if (!this.stream || segment?.state !== "recording" || !this.budget.isFull()) return;
		const nowMs = this.clock.elapsedMs();
		this.segment = this.startSegment(this.stream);
		this.finishedParts.push({ blob: segment.finish(), durationMs: nowMs - this.partStartMs });
		this.partStartMs = nowMs;
		this.budget.reset();
	}

	private startLevelMeter(stream: MediaStream): void {
		this.context = new AudioContext();
		this.analyser = this.context.createAnalyser();
		this.analyser.fftSize = this.samples.length;
		this.context.createMediaStreamSource(stream).connect(this.analyser);
		void this.context.resume();
	}

	private release(): void {
		this.stream?.getTracks().forEach((track) => track.stop());
		void this.context?.close();
		this.stream = null;
		this.context = null;
		this.analyser = null;
		this.segment = null;
		this.finishedParts = [];
	}
}

async function toAudioPart(part: FinishedPart): Promise<AudioPart> {
	return { data: await (await part.blob).arrayBuffer(), durationMs: part.durationMs };
}

function extensionFor(mimeType: string): string {
	if (mimeType.includes("mp4")) return "m4a";
	if (mimeType.includes("ogg")) return "ogg";
	return "webm";
}
