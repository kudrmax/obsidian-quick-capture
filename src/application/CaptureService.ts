import { Destination, destinationProblem, resolveEmbedAudio, resolveFormat } from "../domain/CaptureMode";
import { Clock } from "../domain/Clock";
import { EntryFormatter, EntryTemplate } from "../domain/EntryFormatter";
import { partFileNames } from "../domain/RecordingParts";
import { HeadingTarget, insertEntry } from "../domain/SectionInserter";
import { CaptureSettings } from "../settings";
import { AttachmentStore, AudioPart, AudioRecording, NoteTargets, NoteWriter, SavedAttachment } from "./ports";

export class CaptureError extends Error {}

export class TargetError extends Error {}

export interface CapturedEntry {
	path: string;
	line: number;
}

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

	async captureText(destination: Destination, text: string, tags: readonly string[] = []): Promise<CapturedEntry> {
		const content = text.trimEnd();
		if (content.trim() === "") throw new CaptureError("Nothing to add");
		const notePath = await this.resolveTarget(destination);
		const format = resolveFormat(this.deps.settings().defaults, destination.mode.overrides);
		return this.append(notePath, format.heading, format.text, content, tags);
	}

	async captureAudio(destination: Destination, recording: AudioRecording, tags: readonly string[] = []): Promise<CapturedEntry> {
		const parts = recording.parts.filter((part) => part.data.byteLength > 0);
		if (parts.length === 0 || recording.durationMs < MIN_RECORDING_MS) {
			throw new CaptureError("Recording is empty");
		}
		const settings = this.deps.settings();
		const notePath = await this.resolveTarget(destination);
		const format = resolveFormat(settings.defaults, destination.mode.overrides);
		const saved = await this.saveParts(parts, recording.extension, notePath);
		const prefix = resolveEmbedAudio(settings.embedAudio, destination.mode) ? "!" : "";
		const content = saved.map((attachment) => `${prefix}${attachment.link}`).join(" ");
		try {
			return await this.append(notePath, format.heading, format.audio, content, tags);
		} catch (error) {
			await this.discardAll(saved);
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
	): Promise<CapturedEntry> {
		const entry = this.formatter.format(template, content, tags);
		let line = 0;
		await this.deps.notes.update(notePath, (note) => {
			const insertion = insertEntry(note, heading, entry);
			line = insertion.line;
			return insertion.content;
		});
		return { path: notePath, line };
	}

	private async saveParts(parts: readonly AudioPart[], extension: string, notePath: string): Promise<SavedAttachment[]> {
		const names = partFileNames(this.recordingBaseName(), extension, parts.length);
		const saved: SavedAttachment[] = [];
		try {
			for (const [index, part] of parts.entries()) {
				saved.push(await this.deps.attachments.save(names[index], part.data, notePath));
			}
		} catch (error) {
			await this.discardAll(saved);
			throw error;
		}
		return saved;
	}

	private async discardAll(saved: readonly SavedAttachment[]): Promise<void> {
		for (const attachment of saved) await this.deps.attachments.discard(attachment.path);
	}

	private recordingBaseName(): string {
		const d = this.deps.clock.now();
		const pad = (n: number) => String(n).padStart(2, "0");
		const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
		return `Recording ${stamp}`;
	}
}
