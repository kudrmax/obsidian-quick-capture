const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MIN_BAR_HEIGHT = 2;

export class Waveform {
	private readonly levels: number[] = [];
	private readonly context: CanvasRenderingContext2D;

	constructor(private readonly canvas: HTMLCanvasElement) {
		this.context = canvas.getContext("2d")!;
	}

	push(level: number): void {
		this.levels.push(level);
		if (this.levels.length > 2000) this.levels.splice(0, 1000);
	}

	clear(): void {
		this.levels.length = 0;
		this.draw();
	}

	draw(): void {
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

		ctx.fillStyle = style.getPropertyValue("--dqc-wave-color").trim() || "#e5484d";
		const step = BAR_WIDTH + BAR_GAP;
		const visible = Math.floor(width / step);
		const start = Math.max(0, this.levels.length - visible);
		for (let i = start; i < this.levels.length; i++) {
			const x = width - (this.levels.length - i) * step;
			const barHeight = Math.max(MIN_BAR_HEIGHT, this.levels[i] * (height - 8));
			ctx.beginPath();
			ctx.roundRect(x, middle - barHeight / 2, BAR_WIDTH, barHeight, BAR_WIDTH / 2);
			ctx.fill();
		}
	}
}
