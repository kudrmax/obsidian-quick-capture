import { App, normalizePath } from "obsidian";
import { NoteTargets } from "../application/ports";
import { NoteTarget } from "../domain/CaptureMode";
import { ensureParentFolder } from "./VaultFolders";

export interface DailyNotes {
	getOrCreateToday(): Promise<string>;
	todayPath(): string;
}

export class ObsidianNoteTargets implements NoteTargets {
	constructor(
		private readonly app: App,
		private readonly daily: DailyNotes,
		private readonly warn: (message: string) => void,
	) {}

	async resolve(target: NoteTarget): Promise<string> {
		if (target.type === "daily") return this.daily.getOrCreateToday();
		const path = this.previewPath(target);
		if (this.app.vault.getFileByPath(path)) return path;
		await ensureParentFolder(this.app.vault, path);
		await this.app.vault.create(path, "");
		if (target.wasWritten) {
			this.warn(`${path} was not found, so a new note was created. If the note was renamed or moved, choose it again in Quick Capture settings`);
		}
		return path;
	}

	previewPath(target: NoteTarget): string {
		return target.type === "daily" ? this.daily.todayPath() : normalizePath(target.path.trim());
	}
}
