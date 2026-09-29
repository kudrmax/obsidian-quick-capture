import { App, normalizePath } from "obsidian";
import { NoteTargets } from "../application/ports";
import { ModeTarget } from "../domain/CaptureMode";
import { ensureParentFolder } from "./VaultFolders";

export interface DailyNotes {
	getOrCreateToday(): Promise<string>;
	todayPath(): string;
}

export class ObsidianNoteTargets implements NoteTargets {
	constructor(
		private readonly app: App,
		private readonly daily: DailyNotes,
	) {}

	async resolve(target: ModeTarget): Promise<string> {
		if (target.type === "daily") return this.daily.getOrCreateToday();
		const path = this.previewPath(target);
		if (this.app.vault.getFileByPath(path)) return path;
		await ensureParentFolder(this.app.vault, path);
		await this.app.vault.create(path, "");
		return path;
	}

	previewPath(target: ModeTarget): string {
		return target.type === "daily" ? this.daily.todayPath() : normalizePath(target.path.trim());
	}
}
