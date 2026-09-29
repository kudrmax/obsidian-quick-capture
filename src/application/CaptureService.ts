import { Clock } from "../domain/Clock";
import { EntryFormatter, EntryTemplate } from "../domain/EntryFormatter";
import { insertIntoSection, parseHeading } from "../domain/SectionInserter";
import { CaptureSettings } from "../settings";
import { AttachmentStore, AudioRecording, DailyNoteGateway, NoteWriter } from "./ports";

export class CaptureError extends Error {}

const MIN_RECORDING_MS = 500;

interface CaptureDependencies {
	dailyNotes: DailyNoteGateway;
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

	async captureText(text: string, tags: readonly string[] = []): Promise<void> {
		const content = text.trimEnd();
		if (content.trim() === "") throw new CaptureError("Nothing to add");
		const settings = this.deps.settings();
		const notePath = await this.deps.dailyNotes.getOrCreateToday();
		await this.append(notePath, settings, { prefix: settings.textPrefix, suffix: settings.textSuffix }, content, tags);
	}

	async captureAudio(recording: AudioRecording, tags: readonly string[] = []): Promise<void> {
		if (recording.data.byteLength === 0 || recording.durationMs < MIN_RECORDING_MS) {
			throw new CaptureError("Recording is empty");
		}
		const settings = this.deps.settings();
		const notePath = await this.deps.dailyNotes.getOrCreateToday();
		const saved = await this.deps.attachments.save(this.recordingFileName(recording.extension), recording.data, notePath);
		const content = `${settings.embedAudio ? "!" : ""}${saved.link}`;
		try {
			await this.append(notePath, settings, { prefix: settings.audioPrefix, suffix: settings.audioSuffix }, content, tags);
		} catch (error) {
			await this.deps.attachments.discard(saved.path);
			throw error;
		}
	}

	private async append(
		notePath: string,
		settings: CaptureSettings,
		template: EntryTemplate,
		content: string,
		tags: readonly string[],
	): Promise<void> {
		const entry = this.formatter.format(template, content, tags);
		await this.deps.notes.update(notePath, (note) => insertIntoSection(note, parseHeading(settings.heading, 2), entry));
	}

	private recordingFileName(extension: string): string {
		const d = this.deps.clock.now();
		const pad = (n: number) => String(n).padStart(2, "0");
		const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
		return `Recording ${stamp}.${extension}`;
	}
}
