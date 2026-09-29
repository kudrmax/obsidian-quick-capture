import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "../src/settings";

describe("loadSettings", () => {
	it("fills missing values with defaults", () => {
		expect(loadSettings({ heading: "Journal" })).toEqual({ ...DEFAULT_SETTINGS, heading: "Journal" });
	});

	it("starts without tag groups when none are saved", () => {
		expect(loadSettings(null).tagGroups).toEqual([]);
	});

	it("never shares the default tag group list between loads", () => {
		loadSettings(undefined).tagGroups.push({ name: "Books", tags: [] });
		expect(loadSettings(undefined).tagGroups).toEqual([]);
	});

	it("keeps saved tag groups", () => {
		const tagGroups = [{ name: "Books", tags: [{ tag: "#book/quote", icon: "quote" }] }];
		expect(loadSettings({ tagGroups }).tagGroups).toEqual(tagGroups);
	});
});
