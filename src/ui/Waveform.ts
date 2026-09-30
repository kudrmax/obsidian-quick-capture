const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MIN_BAR_HEIGHT = 2;
const MAX_LEVELS = 60_000;

export function lastBars(levels: number[], count: number): number[] {
	return levels.slice(Math.max(0, levels.length - count));
}

export function fitBars(levels: number[], count: number): number[] {
	if (levels.length <= count) return [...levels];
	return Array.from({ length: count }, (_, bar) => {
		const start = Math.floor((bar * levels.length) / count);
		const end = Math.floor(((bar + 1) * levels.length) / count);
		return Math.max(...levels.slice(start, end));
	});
}

export class Waveform {
	private readonly levels: number[] = [];
	private readonly context: CanvasRenderingContext2D;

	constructor(private readonly canvas: HTMLCanvasElement) {
		this.context = canvas.getContext("2d")!;
	}

	push(level: number): void {
		this.levels.push(level);
		if (this.levels.length > MAX_LEVELS) this.levels.splice(0, MAX_LEVELS / 2);
	}

	clear(): void {
		this.levels.length = 0;
		this.draw();
	}

	draw(progress: number | null = null, shift = 0): void {
		const ratio = window.devicePixelRatio || 1;
		const width = this.canvas.clientWidth;
		const height = this.canvas.clientHeight;
		if (this.canvas.width !== width * ratio || this.canvas.height !== height * ratio) {
			this.canvas.width = width * ratio;
			this.canvas.height = height * ratio;
		}
		const ctx = this.context;
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.clearRect(0, 0, width, height);

		const style = getComputedStyle(this.canvas);
		const middle = height / 2;
		ctx.fillStyle = style.getPropertyValue("--dqc-wave-baseline").trim() || "#888";
		ctx.fillRect(0, middle - 0.5, width, 1);

		const color = style.getPropertyValue("--dqc-wave-color").trim() || "#e5484d";
		const played = style.getPropertyValue("--dqc-wave-played").trim() || color;
		const step = BAR_WIDTH + BAR_GAP;
		const visible = Math.floor(width / step);
		const bars = progress === null ? lastBars(this.levels, visible + 1) : fitBars(this.levels, visible);
		for (let i = 0; i < bars.length; i++) {
			const x = width - (bars.length - i + shift) * step;
			const barHeight = Math.max(MIN_BAR_HEIGHT, bars[i] * (height - 8));
			ctx.fillStyle = progress !== null && (i + 0.5) / bars.length <= progress ? played : color;
			ctx.beginPath();
			ctx.roundRect(x, middle - barHeight / 2, BAR_WIDTH, barHeight, BAR_WIDTH / 2);
			ctx.fill();
		}
	}
}
