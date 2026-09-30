const MAX_CATCH_UP = 5;

export interface Tick {
	samples: number;
	fraction: number;
}

export class SampleTicker {
	private lastSampleAt = 0;

	constructor(private readonly intervalMs: number) {}

	start(now: number): void {
		this.lastSampleAt = now;
	}

	tick(now: number): Tick {
		if (now < this.lastSampleAt) return { samples: 0, fraction: 0 };
		let samples = Math.floor((now - this.lastSampleAt) / this.intervalMs);
		if (samples > MAX_CATCH_UP) {
			samples = 1;
			this.lastSampleAt = now;
		} else {
			this.lastSampleAt += samples * this.intervalMs;
		}
		return { samples, fraction: (now - this.lastSampleAt) / this.intervalMs };
	}
}
