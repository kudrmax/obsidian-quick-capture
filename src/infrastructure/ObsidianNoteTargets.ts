import { App, normalizePath } from "obsidian";
import { NoteTargets } from "../application/ports";
import { NoteTarget } from "../domain/CaptureMode";
import { ensureParentFolder } from "./VaultFolders";

export interface DailyNotes {
	getOrCreate(daysBack: number): Promise<string>;
	path(daysBack: number): string;
}

export class ObsidianNoteTargets implements NoteTargets {
	constructor(
		private readonly app: App,
		private readonly daily: DailyNotes,
		private readonly warn: (message: string) => void,
	) {}

	async resolve(target: NoteTarget): Promise<string> {
		if (target.type === "daily") return this.daily.getOrCreate(target.daysBack);
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
		return target.type === "daily" ? this.daily.path(target.daysBack) : normalizePath(target.path.trim());
	}
}
