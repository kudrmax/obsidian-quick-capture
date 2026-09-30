import { describe, expect, it } from "vitest";
import { mimeTypeFor, playbackProgress } from "../src/infrastructure/HtmlAudioPlayer";
import { fitBars, lastBars } from "../src/ui/Waveform";

describe("fitBars", () => {
	it("keeps a recording that already fits", () => {
		expect(fitBars([0.1, 0.5], 4)).toEqual([0.1, 0.5]);
	});

	it("squeezes a long recording into the available bars, keeping peaks", () => {
		expect(fitBars([0.1, 0.9, 0.2, 0.3, 0.4, 0.1], 3)).toEqual([0.9, 0.3, 0.4]);
	});

	it("spreads an uneven recording over every bar", () => {
		expect(fitBars([1, 2, 3, 4, 5], 2)).toEqual([2, 5]);
	});

	it("returns nothing when there is no room", () => {
		expect(fitBars([0.5], 0)).toEqual([]);
	});
});

describe("lastBars", () => {
	it("keeps every bar while the recording is shorter than the room", () => {
		expect(lastBars([1, 2, 3], 4)).toEqual([1, 2, 3]);
	});

	it("keeps every bar past half of the room", () => {
		expect(lastBars([1, 2, 3, 4, 5, 6], 8)).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it("keeps the newest bars once the room is full", () => {
		expect(lastBars([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
	});

	it("returns nothing when there is no room", () => {
		expect(lastBars([1, 2], 0)).toEqual([]);
	});
});

describe("mimeTypeFor", () => {
	it("maps recording extensions to playable types", () => {
		expect(mimeTypeFor("m4a")).toBe("audio/mp4");
		expect(mimeTypeFor("webm")).toBe("audio/webm");
		expect(mimeTypeFor("ogg")).toBe("audio/ogg");
	});
});

describe("playbackProgress", () => {
	it("is the played share of the recording, within 0 and 1", () => {
		expect(playbackProgress(500, 2000)).toBe(0.25);
		expect(playbackProgress(3000, 2000)).toBe(1);
		expect(playbackProgress(100, 0)).toBe(0);
	});
});
