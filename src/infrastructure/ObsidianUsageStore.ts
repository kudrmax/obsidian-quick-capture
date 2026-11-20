import { App } from "obsidian";
import { UsageStore } from "../application/ports";
import { DeviceUsage } from "../domain/DeviceUsage";

const KEY = "quick-capture-usage";

export class ObsidianUsageStore implements UsageStore {
	constructor(private readonly app: App) {}

	load(): DeviceUsage | null {
		const saved: unknown = this.app.loadLocalStorage(KEY);
		return isUsage(saved) ? saved : null;
	}

	save(usage: DeviceUsage): void {
		this.app.saveLocalStorage(KEY, usage);
	}
}

function isUsage(value: unknown): value is DeviceUsage {
	if (typeof value !== "object" || value === null) return false;
	const usage = value as Partial<DeviceUsage>;
	return typeof usage.lastDestinationId === "string" && typeof usage.files === "object" && usage.files !== null;
}
