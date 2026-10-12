export const MAX_PART_BYTES = 4.5 * 1024 * 1024;

export function partFileNames(baseName: string, extension: string, count: number): string[] {
	if (count === 1) return [`${baseName}.${extension}`];
	return Array.from({ length: count }, (_, index) => `${baseName} (${index + 1}).${extension}`);
}

export function partOffsets(durationsMs: readonly number[]): number[] {
	let offset = 0;
	return durationsMs.map((duration) => {
		const start = offset;
		offset += duration;
		return start;
	});
}

export class PartSizeBudget {
	private bytes = 0;

	constructor(private readonly maxBytes: number) {}

	add(chunkBytes: number): void {
		this.bytes += chunkBytes;
	}

	isFull(): boolean {
		return this.bytes >= this.maxBytes;
	}

	reset(): void {
		this.bytes = 0;
	}
}
