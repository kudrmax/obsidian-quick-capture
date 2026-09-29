import { App, moment, normalizePath, TFile } from "obsidian";
import { Clock } from "../domain/Clock";
import { dailyNotePath, renderDailyTemplate } from "../domain/DailyNoteTemplate";
import { DailyNotes } from "./ObsidianNoteTargets";
import { ensureParentFolder } from "./VaultFolders";

interface DailyNotesOptions {
	folder?: string;
	format?: string;
	template?: string;
}

interface InternalPlugins {
	getPluginById(id: string): { enabled?: boolean; instance?: { options?: DailyNotesOptions } } | null;
}

type MomentFactory = (date: Date) => { format(format: string): string };

const createMoment = moment as unknown as MomentFactory;
const formatDate = (date: Date, format: string) => createMoment(date).format(format);

export class ObsidianDailyNotes implements DailyNotes {
	constructor(
		private readonly app: App,
		private readonly clock: Clock,
		private readonly warn: (message: string) => void,
	) {}

	todayPath(): string {
		return this.pathFor(this.options(), this.clock.now());
	}

	async getOrCreateToday(): Promise<string> {
		const options = this.options();
		const now = this.clock.now();
		const path = this.pathFor(options, now);
		if (this.app.vault.getFileByPath(path)) return path;

		await ensureParentFolder(this.app.vault, path);
		const title = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
		const template = await this.readTemplate(options.template ?? "");
		await this.app.vault.create(path, renderDailyTemplate(template, title, now, formatDate, options.format ?? ""));
		return path;
	}

	private pathFor(options: DailyNotesOptions, date: Date): string {
		return normalizePath(dailyNotePath(options.folder ?? "", options.format ?? "", date, formatDate));
	}

	private options(): DailyNotesOptions {
		const internal = (this.app as unknown as { internalPlugins?: InternalPlugins }).internalPlugins;
		const plugin = internal?.getPluginById("daily-notes");
		return (plugin?.enabled !== false && plugin?.instance?.options) || {};
	}

	private async readTemplate(templatePath: string): Promise<string> {
		const linkpath = templatePath.trim();
		if (!linkpath) return "";
		const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, "");
		if (!(file instanceof TFile)) {
			this.warn(`Daily note template not found: ${linkpath}`);
			return "";
		}
		return this.app.vault.cachedRead(file);
	}
}
