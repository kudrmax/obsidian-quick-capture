import { NoteTarget } from "../domain/CaptureMode";

export interface NoteTargets {
	resolve(target: NoteTarget): Promise<string>;
}

export interface NoteWriter {
	update(path: string, transform: (content: string) => string): Promise<void>;
}

export interface SavedAttachment {
	path: string;
	link: string;
}

export interface AttachmentStore {
	save(fileName: string, data: ArrayBuffer, notePath: string): Promise<SavedAttachment>;
	discard(path: string): Promise<void>;
}

export interface AudioPart {
	data: ArrayBuffer;
	durationMs: number;
}

export interface AudioRecording {
	parts: AudioPart[];
	extension: string;
	durationMs: number;
}
