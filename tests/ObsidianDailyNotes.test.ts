import { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { ObsidianDailyNotes } from "../src/infrastructure/ObsidianDailyNotes";
import { TFile } from "./stubs/obsidian";

interface DailyOptions {
	folder?: string;
	format?: string;
	template?: string;
}

class FakeVault {
	files = new Map<string, string>();
	folders = new Set<string>();
	createdFolders: string[] = [];

	getFileByPath(path: string) {
		return this.files.has(path) ? new TFile(path) : null;
	}
	getFolderByPath(path: string) {
		return this.folders.has(path) ? { path } : null;
	}
	async createFolder(path: string) {
		this.folders.add(path);
		this.createdFolders.push(path);
	}
	async create(path: string, content: string) {
		this.files.set(path, content);
		return new TFile(path);
	}
	async cachedRead(file: TFile) {
		return this.files.get(file.path) ?? "";
	}
}

function setup(options: DailyOptions | null, enabled = true) {
	const vault = new FakeVault();
	const warnings: string[] = [];
	const app = {
		vault,
		metadataCache: {
			getFirstLinkpathDest: (linkpath: string) => {
				const path = linkpath.endsWith(".md") ? linkpath : `${linkpath}.md`;
				return vault.files.has(path) ? new TFile(path) : null;
			},
		},
		internalPlugins: { getPluginById: () => (options ? { enabled, instance: { options } } : null) },
	} as unknown as App;
	const dailyNotes = new ObsidianDailyNotes(app, { now: () => new Date(2026, 8, 29, 7, 4) }, (message) => warnings.push(message));
	return { vault, warnings, dailyNotes };
}

describe("ObsidianDailyNotes", () => {
	it("returns today's existing note without creating anything", async () => {
		const { vault, dailyNotes } = setup({ folder: "Journal", format: "YYYY-MM-DD" });
		vault.files.set("Journal/2026-09-29.md", "existing");
		expect(await dailyNotes.getOrCreateToday()).toBe("Journal/2026-09-29.md");
		expect(vault.files.get("Journal/2026-09-29.md")).toBe("existing");
		expect(vault.createdFolders).toEqual([]);
	});

	it("creates every missing parent folder, including folders from the format", async () => {
		const { vault, dailyNotes } = setup({ folder: "Journal", format: "YYYY/MM/YYYY-MM-DD" });
		vault.folders.add("Journal");
		expect(await dailyNotes.getOrCreateToday()).toBe("Journal/2026/09/2026-09-29.md");
		expect(vault.createdFolders).toEqual(["Journal/2026", "Journal/2026/09"]);
		expect(vault.files.get("Journal/2026/09/2026-09-29.md")).toBe("");
	});

	it("fills the new note from the template", async () => {
		const { vault, dailyNotes } = setup({ format: "DD.MM.YYYY", template: "Templates/Daily" });
		vault.files.set("Templates/Daily.md", "# {{title}}\n{{date}} {{time}}");
		await dailyNotes.getOrCreateToday();
		expect(vault.files.get("29.09.2026.md")).toBe("# 29.09.2026\n29.09.2026 07:04");
	});

	it("creates an empty note and warns when the template is missing", async () => {
		const { vault, warnings, dailyNotes } = setup({ template: "Templates/Gone" });
		await dailyNotes.getOrCreateToday();
		expect(vault.files.get("2026-09-29.md")).toBe("");
		expect(warnings).toEqual(["Daily note template not found: Templates/Gone"]);
	});

	it("falls back to defaults when the Daily notes plugin is disabled", async () => {
		const { vault, dailyNotes } = setup({ folder: "Journal", format: "DD.MM.YYYY" }, false);
		expect(await dailyNotes.getOrCreateToday()).toBe("2026-09-29.md");
		expect(vault.files.has("2026-09-29.md")).toBe(true);
	});

	it("reports today's path without creating the note", () => {
		const { vault, dailyNotes } = setup({ folder: "Journal/Daily notes", format: "YYYY-MM-DD" });
		expect(dailyNotes.todayPath()).toBe("Journal/Daily notes/2026-09-29.md");
		expect(vault.files.size).toBe(0);
	});
});
