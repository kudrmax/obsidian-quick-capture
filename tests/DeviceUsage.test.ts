import { describe, expect, it } from "vitest";
import { applyUsage, sharedSettings, deviceUsage } from "../src/domain/DeviceUsage";
import { CaptureSettings, loadSettings } from "../src/settings";

function settingsWithBooks(): CaptureSettings {
	const settings = loadSettings(null);
	const daily = settings.modes[0];
	settings.modes.push({
		...structuredClone(daily),
		id: "books",
		title: "Книги",
		target: {
			type: "files",
			files: [
				{ id: "a", alias: "A", path: "A.md", lastUsedAt: 5, writtenPath: "A.md" },
				{ id: "b", alias: "B", path: "B.md", lastUsedAt: 9 },
			],
		},
	});
	settings.lastDestinationId = "b";
	return settings;
}

function files(settings: CaptureSettings) {
	const target = settings.modes[1].target;
	return target.type === "files" ? target.files : [];
}

describe("deviceUsage", () => {
	it("takes what this device used last and which files it wrote", () => {
		expect(deviceUsage(settingsWithBooks())).toEqual({
			lastDestinationId: "b",
			files: { a: { lastUsedAt: 5, writtenPath: "A.md" }, b: { lastUsedAt: 9 } },
		});
	});
});

describe("sharedSettings", () => {
	it("leaves out what only this device used, so a capture never changes the synced file", () => {
		const shared = sharedSettings(settingsWithBooks()) as Record<string, unknown> & { modes: CaptureSettings["modes"] };
		expect("lastDestinationId" in shared).toBe(false);
		const target = shared.modes[1].target;
		expect(target.type === "files" && target.files).toEqual([
			{ id: "a", alias: "A", path: "A.md" },
			{ id: "b", alias: "B", path: "B.md" },
		]);
	});

	it("keeps the settings it was given untouched", () => {
		const settings = settingsWithBooks();
		sharedSettings(settings);
		expect(settings).toEqual(settingsWithBooks());
	});
});

describe("applyUsage", () => {
	it("puts back what this device used", () => {
		const settings = loadSettings(JSON.parse(JSON.stringify(sharedSettings(settingsWithBooks()))));
		applyUsage(settings, deviceUsage(settingsWithBooks()));
		expect(settings).toEqual(settingsWithBooks());
	});

	it("starts a device that used nothing yet from the first destination and never-used files", () => {
		const settings = loadSettings(JSON.parse(JSON.stringify(sharedSettings(settingsWithBooks()))));
		applyUsage(settings, null);
		expect(settings.lastDestinationId).toBe("daily");
		expect(files(settings)).toEqual([
			{ id: "a", alias: "A", path: "A.md", lastUsedAt: 0 },
			{ id: "b", alias: "B", path: "B.md", lastUsedAt: 0 },
		]);
	});

	it("keeps usage saved in the settings by older versions until this device has its own", () => {
		const settings = settingsWithBooks();
		applyUsage(settings, null);
		expect(settings).toEqual(settingsWithBooks());
	});

	it("gives a file added on another device no usage here", () => {
		const settings = settingsWithBooks();
		applyUsage(settings, { lastDestinationId: "a", files: { a: { lastUsedAt: 1 } } });
		expect(files(settings)).toEqual([
			{ id: "a", alias: "A", path: "A.md", lastUsedAt: 1 },
			{ id: "b", alias: "B", path: "B.md", lastUsedAt: 0 },
		]);
		expect(settings.lastDestinationId).toBe("a");
	});
});
