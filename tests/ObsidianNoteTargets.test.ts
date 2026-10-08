import { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { ObsidianNoteTargets } from "../src/infrastructure/ObsidianNoteTargets";
import { TFile } from "./stubs/obsidian";

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
}

function setup() {
	const vault = new FakeVault();
	const daily = { getOrCreateToday: async () => "Daily/today.md", todayPath: () => "Daily/today.md" };
	const warnings: string[] = [];
	const targets = new ObsidianNoteTargets({ vault } as unknown as App, daily, (message) => warnings.push(message));
	return { vault, targets, warnings };
}

describe("ObsidianNoteTargets", () => {
	it("uses today's daily note for the daily target", async () => {
		const { targets } = setup();
		expect(await targets.resolve({ type: "daily" })).toBe("Daily/today.md");
		expect(targets.previewPath({ type: "daily" })).toBe("Daily/today.md");
	});

	it("returns an existing file untouched", async () => {
		const { vault, targets } = setup();
		vault.files.set("Books/Book.md", "old");
		expect(await targets.resolve({ type: "file", path: "Books/Book.md" })).toBe("Books/Book.md");
		expect(vault.files.get("Books/Book.md")).toBe("old");
	});

	it("creates a missing file together with its folders", async () => {
		const { vault, targets } = setup();
		vault.folders.add("Books");
		expect(await targets.resolve({ type: "file", path: "Books/2026/Book.md" })).toBe("Books/2026/Book.md");
		expect(vault.createdFolders).toEqual(["Books/2026"]);
		expect(vault.files.get("Books/2026/Book.md")).toBe("");
	});

	it("creates a new file quietly", async () => {
		const { targets, warnings } = setup();
		await targets.resolve({ type: "file", path: "Books/Book.md", wasWritten: false });
		expect(warnings).toEqual([]);
	});

	it("recreates a file that was written to before and warns that it went missing", async () => {
		const { vault, targets, warnings } = setup();
		expect(await targets.resolve({ type: "file", path: "Books/Book.md", wasWritten: true })).toBe("Books/Book.md");
		expect(vault.files.get("Books/Book.md")).toBe("");
		expect(warnings).toEqual(["Books/Book.md was not found, so a new note was created. If the note was renamed or moved, choose it again in Quick Capture settings"]);
	});

	it("normalizes the configured path", async () => {
		const { vault, targets } = setup();
		expect(await targets.resolve({ type: "file", path: " /Ideas//Idea.md " })).toBe("Ideas/Idea.md");
		expect(vault.files.has("Ideas/Idea.md")).toBe(true);
		expect(targets.previewPath({ type: "file", path: "/Ideas//Idea.md" })).toBe("Ideas/Idea.md");
	});
});
