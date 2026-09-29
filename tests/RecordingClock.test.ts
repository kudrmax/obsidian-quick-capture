import { describe, expect, it } from "vitest";
import { RecordingClock } from "../src/domain/RecordingClock";

class ManualTime {
	value = 0;
	readonly now = () => this.value;
}

describe("RecordingClock", () => {
	it("is zero before it starts", () => {
		const time = new ManualTime();
		time.value = 50_000;
		expect(new RecordingClock(time.now).elapsedMs()).toBe(0);
	});

	it("counts time while running", () => {
		const time = new ManualTime();
		const clock = new RecordingClock(time.now);
		time.value = 1_000;
		clock.start();
		time.value = 3_500;
		expect(clock.elapsedMs()).toBe(2_500);
	});

	it("freezes while paused", () => {
		const time = new ManualTime();
		const clock = new RecordingClock(time.now);
		clock.start();
		time.value = 36_900;
		clock.pause();
		time.value = 40_000;
		expect(clock.elapsedMs()).toBe(36_900);
	});

	it("continues from the paused value right after resume", () => {
		const time = new ManualTime();
		const clock = new RecordingClock(time.now);
		clock.start();
		time.value = 36_900;
		clock.pause();
		time.value = 60_000;
		clock.resume();
		expect(clock.elapsedMs()).toBe(36_900);
		time.value = 61_000;
		expect(clock.elapsedMs()).toBe(37_900);
	});

	it("ignores a repeated pause", () => {
		const time = new ManualTime();
		const clock = new RecordingClock(time.now);
		clock.start();
		time.value = 10_000;
		clock.pause();
		time.value = 12_000;
		clock.pause();
		expect(clock.elapsedMs()).toBe(10_000);
	});

	it("ignores a repeated resume", () => {
		const time = new ManualTime();
		const clock = new RecordingClock(time.now);
		clock.start();
		time.value = 10_000;
		clock.resume();
		expect(clock.elapsedMs()).toBe(10_000);
	});

	it("restarts from zero", () => {
		const time = new ManualTime();
		const clock = new RecordingClock(time.now);
		clock.start();
		time.value = 10_000;
		clock.start();
		time.value = 11_000;
		expect(clock.elapsedMs()).toBe(1_000);
	});
});
