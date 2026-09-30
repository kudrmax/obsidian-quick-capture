import { describe, expect, it } from "vitest";
import { SampleTicker } from "../src/ui/SampleTicker";

describe("SampleTicker", () => {
	it("takes no sample right after starting", () => {
		const ticker = new SampleTicker(60);
		ticker.start(1000);
		expect(ticker.tick(1000)).toEqual({ samples: 0, fraction: 0 });
	});

	it("reports how far the next sample is between samples", () => {
		const ticker = new SampleTicker(60);
		ticker.start(1000);
		expect(ticker.tick(1030)).toEqual({ samples: 0, fraction: 0.5 });
	});

	it("takes every sample that came due since the last frame", () => {
		const ticker = new SampleTicker(60);
		ticker.start(1000);
		expect(ticker.tick(1135)).toEqual({ samples: 2, fraction: 0.25 });
		expect(ticker.tick(1180)).toEqual({ samples: 1, fraction: 0 });
	});

	it("does not catch up after a long stall", () => {
		const ticker = new SampleTicker(60);
		ticker.start(0);
		expect(ticker.tick(10_000).samples).toBe(1);
		expect(ticker.tick(10_030)).toEqual({ samples: 0, fraction: 0.5 });
	});

	it("ignores a frame stamped just before the start", () => {
		const ticker = new SampleTicker(60);
		ticker.start(1000);
		expect(ticker.tick(995)).toEqual({ samples: 0, fraction: 0 });
		expect(ticker.tick(1060).samples).toBe(1);
	});
});
