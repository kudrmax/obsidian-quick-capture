import { Destination, destinationProblem, resolveFormat } from "../domain/CaptureMode";
import { Clock } from "../domain/Clock";
import { EntryFormatter, EntryTemplate } from "../domain/EntryFormatter";
import { HeadingTarget, insertIntoSection } from "../domain/SectionInserter";
import { CaptureSettings } from "../settings";
import { AttachmentStore, AudioRecording, NoteTargets, NoteWriter } from "./ports";

export class CaptureError extends Error {}

export class TargetError extends Error {}

const MIN_RECORDING_MS = 500;

interface CaptureDependencies {
	targets: NoteTargets;
	notes: NoteWriter;
	attachments: AttachmentStore;
	clock: Clock;
	settings: () => CaptureSettings;
}

export class CaptureService {
	private readonly formatter: EntryFormatter;

	constructor(private readonly deps: CaptureDependencies) {
		this.formatter = new EntryFormatter(deps.clock);
	}

	async captureText(destination: Destination, text: string, tags: readonly string[] = []): Promise<void> {
		const content = text.trimEnd();
		if (content.trim() === "") throw new CaptureError("Nothing to add");
		const notePath = await this.resolveTarget(destination);
		const format = resolveFormat(this.deps.settings().defaults, destination.mode.overrides);
		await this.append(notePath, format.heading, format.text, content, tags);
	}

	async captureAudio(destination: Destination, recording: AudioRecording, tags: readonly string[] = []): Promise<void> {
		if (recording.data.byteLength === 0 || recording.durationMs < MIN_RECORDING_MS) {
			throw new CaptureError("Recording is empty");
		}
		const settings = this.deps.settings();
		const notePath = await this.resolveTarget(destination);
		const format = resolveFormat(settings.defaults, destination.mode.overrides);
		const saved = await this.deps.attachments.save(this.recordingFileName(recording.extension), recording.data, notePath);
		const content = `${settings.embedAudio ? "!" : ""}${saved.link}`;
		try {
			await this.append(notePath, format.heading, format.audio, content, tags);
		} catch (error) {
			await this.deps.attachments.discard(saved.path);
			throw error;
		}
	}

	private resolveTarget(destination: Destination): Promise<string> {
		const problem = destinationProblem(destination);
		if (problem) return Promise.reject(new TargetError(problem));
		return this.deps.targets.resolve(destination.target);
	}

	private async append(
		notePath: string,
		heading: HeadingTarget | null,
		template: EntryTemplate,
		content: string,
		tags: readonly string[],
	): Promise<void> {
		const entry = this.formatter.format(template, content, tags);
		await this.deps.notes.update(notePath, (note) => insertIntoSection(note, heading, entry));
	}

	private recordingFileName(extension: string): string {
		const d = this.deps.clock.now();
		const pad = (n: number) => String(n).padStart(2, "0");
		const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
		return `Recording ${stamp}.${extension}`;
	}
}
