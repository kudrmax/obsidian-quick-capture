export interface DailyNoteGateway {
	getOrCreateToday(): Promise<string>;
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

export interface AudioRecording {
	data: ArrayBuffer;
	extension: string;
	durationMs: number;
}
