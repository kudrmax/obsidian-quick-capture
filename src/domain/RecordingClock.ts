export class RecordingClock {
	private accumulatedMs = 0;
	private runningSince: number | null = null;

	constructor(private readonly now: () => number) {}

	start(): void {
		this.accumulatedMs = 0;
		this.runningSince = this.now();
	}

	pause(): void {
		if (this.runningSince === null) return;
		this.accumulatedMs += this.now() - this.runningSince;
		this.runningSince = null;
	}

	resume(): void {
		if (this.runningSince === null) this.runningSince = this.now();
	}

	elapsedMs(): number {
		return this.runningSince === null ? this.accumulatedMs : this.accumulatedMs + this.now() - this.runningSince;
	}
}
