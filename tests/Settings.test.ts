import { describe, expect, it } from "vitest";
import { NO_OVERRIDES } from "../src/domain/CaptureMode";
import { DEFAULT_SETTINGS, loadSettings, newId } from "../src/settings";

const LEGACY = {
	heading: "Дневник",
	textPrefix: "- {{time}}. ",
	textSuffix: "",
	audioPrefix: "- {{time}}. ",
	audioSuffix: " #transcribe",
	embedAudio: false,
	afterSend: "stay",
	tagGroups: [
		{
			name: "Daily",
			tags: [
				{ tag: "#like", icon: "thumbs-up" },
				{ tag: "#dislike", icon: "thumbs-down" },
			],
		},
	],
};

describe("loadSettings", () => {
	it("starts with one daily mode and no tag groups", () => {
		const settings = loadSettings(null);
		expect(settings.defaults).toEqual(DEFAULT_SETTINGS.defaults);
		expect(settings.tagGroups).toEqual([]);
		expect(settings.modes).toEqual([
			{ id: "daily", title: "", target: { type: "daily" }, overrides: NO_OVERRIDES, afterSend: "default", audioLink: "default", tagGroupIds: [] },
		]);
		expect(settings.lastDestinationId).toBe("daily");
	});

	it("moves legacy settings into defaults and a daily mode with every tag group", () => {
		const settings = loadSettings(LEGACY);
		expect(settings.defaults).toEqual({
			heading: "Дневник",
			headingLevel: 2,
			textPrefix: "- {{time}}. ",
			textSuffix: "",
			audioPrefix: "- {{time}}. ",
			audioSuffix: " #transcribe",
		});
		expect(settings.embedAudio).toBe(false);
		expect(settings.afterSend).toBe("stay");
		expect(settings.tagGroups).toEqual([{ id: "group-1", ...LEGACY.tagGroups[0] }]);
		expect(settings.modes).toEqual([
			{ id: "daily", title: "", target: { type: "daily" }, overrides: NO_OVERRIDES, afterSend: "default", audioLink: "default", tagGroupIds: ["group-1"] },
		]);
		expect(settings.lastDestinationId).toBe("daily");
		expect(settings).not.toHaveProperty("heading");
	});

	it("turns hashes of a legacy heading into its level", () => {
		const defaults = loadSettings({ ...LEGACY, heading: "### Дневник" }).defaults;
		expect(defaults.heading).toBe("Дневник");
		expect(defaults.headingLevel).toBe(3);
	});

	it("fills legacy values that were never saved", () => {
		expect(loadSettings({ heading: "Journal" }).defaults).toEqual({ ...DEFAULT_SETTINGS.defaults, heading: "Journal" });
	});

	it("keeps settings saved in the current format", () => {
		const saved = loadSettings(LEGACY);
		saved.modes.push({
			id: "books",
			title: "Книги",
			target: { type: "files", files: [{ id: "b", alias: "Book", path: "B.md", lastUsedAt: 7 }] },
			overrides: NO_OVERRIDES, afterSend: "default", audioLink: "default",
			tagGroupIds: [],
		});
		saved.lastDestinationId = "b";
		expect(loadSettings(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
	});

	it("turns a single-file mode into a files mode that keeps its id, title and command", () => {
		const { lastDestinationId: _, ...saved } = loadSettings(LEGACY);
		const settings = loadSettings({
			...JSON.parse(JSON.stringify(saved)),
			modes: [
				saved.modes[0],
				{ id: "book", title: "Мастер", target: { type: "file", path: "Books/M.md" }, overrides: NO_OVERRIDES, tagGroupIds: ["group-1"] },
			],
			lastModeId: "book",
		});
		expect(settings.modes[1]).toEqual({
			id: "book",
			title: "Мастер",
			target: { type: "files", files: [{ id: "book", alias: "Мастер", path: "Books/M.md", lastUsedAt: 0 }] },
			overrides: NO_OVERRIDES, afterSend: "default", audioLink: "default",
			tagGroupIds: ["group-1"],
		});
		expect(settings.lastDestinationId).toBe("book");
		expect(settings).not.toHaveProperty("lastModeId");
	});

	it("lets modes saved before their own choices follow the general ones", () => {
		const saved = JSON.parse(JSON.stringify(loadSettings(LEGACY)));
		delete saved.modes[0].afterSend;
		delete saved.modes[0].audioLink;
		expect(loadSettings(saved).modes[0]).toMatchObject({ afterSend: "default", audioLink: "default" });
	});

	it("keeps a mode's own after-sending choice", () => {
		const saved = loadSettings(LEGACY);
		saved.modes[0].afterSend = "open";
		saved.modes[0].audioLink = "link";
		expect(loadSettings(JSON.parse(JSON.stringify(saved))).modes[0]).toMatchObject({ afterSend: "open", audioLink: "link" });
	});

	it("opens the keyboard on mobile unless turned off", () => {
		expect(loadSettings(null).openKeyboardOnMobile).toBe(true);
		const { openKeyboardOnMobile: _, ...saved } = loadSettings(LEGACY);
		expect(loadSettings(JSON.parse(JSON.stringify(saved))).openKeyboardOnMobile).toBe(true);
		expect(loadSettings({ ...saved, openKeyboardOnMobile: false }).openKeyboardOnMobile).toBe(false);
	});

	it("ends the day at 05:00 unless a valid time is saved", () => {
		expect(loadSettings(null).dayEndsAt).toBe("05:00");
		expect(loadSettings(LEGACY).dayEndsAt).toBe("05:00");
		const { dayEndsAt: _, ...saved } = loadSettings(null);
		expect(loadSettings(saved).dayEndsAt).toBe("05:00");
		expect(loadSettings({ ...saved, dayEndsAt: "03:30" }).dayEndsAt).toBe("03:30");
		expect(loadSettings({ ...saved, dayEndsAt: "nonsense" }).dayEndsAt).toBe("05:00");
	});

		it("never shares lists between loads", () => {
		const first = loadSettings(undefined);
		first.tagGroups.push({ id: "x", name: "Books", tags: [] });
		first.modes[0].tagGroupIds.push("x");
		const second = loadSettings(undefined);
		expect(second.tagGroups).toEqual([]);
		expect(second.modes[0].tagGroupIds).toEqual([]);
	});
});

describe("newId", () => {
	it("still makes unique ids where crypto.randomUUID is missing", () => {
		const original = crypto.randomUUID;
		Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
		try {
			const ids = new Set(Array.from({ length: 50 }, () => newId()));
			expect(ids.size).toBe(50);
			expect([...ids].every((id) => id.length >= 8)).toBe(true);
		} finally {
			Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
		}
	});
});
