import { App } from "obsidian";
import { AttachmentStore, SavedAttachment } from "../application/ports";

export class ObsidianAttachments implements AttachmentStore {
	constructor(private readonly app: App) {}

	async save(fileName: string, data: ArrayBuffer, notePath: string): Promise<SavedAttachment> {
		const path = await this.app.fileManager.getAvailablePathForAttachment(fileName, notePath);
		const file = await this.app.vault.createBinary(path, data);
		return { path: file.path, link: this.app.fileManager.generateMarkdownLink(file, notePath) };
	}

	async discard(path: string): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (file) await this.app.fileManager.trashFile(file);
	}
}
