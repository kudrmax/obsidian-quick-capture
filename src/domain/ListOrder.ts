export function moveItem<T>(list: T[], index: number, step: -1 | 1): void {
	const target = index + step;
	if (target < 0 || target >= list.length) return;
	[list[index], list[target]] = [list[target], list[index]];
}
