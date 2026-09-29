import { App } from "obsidian";
import { NoteWriter } from "../application/ports";

export class ObsidianNoteWriter implements NoteWriter {
	constructor(private readonly app: App) {}

	async update(path: string, transform: (content: string) => string): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) throw new Error(`Note not found: ${path}`);
		await this.app.vault.process(file, transform);
	}
}
