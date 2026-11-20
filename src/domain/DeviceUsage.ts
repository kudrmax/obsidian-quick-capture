import type { CaptureSettings } from "../settings";
import { ModeFile } from "./CaptureMode";

interface FileUsage {
	lastUsedAt: number;
	writtenPath?: string;
}

export interface DeviceUsage {
	lastDestinationId: string;
	files: Record<string, FileUsage>;
}

type SharedFile = Omit<ModeFile, keyof FileUsage>;

export function deviceUsage(settings: CaptureSettings): DeviceUsage {
	const files: Record<string, FileUsage> = {};
	for (const file of modeFiles(settings)) {
		files[file.id] = file.writtenPath === undefined ? { lastUsedAt: file.lastUsedAt } : { lastUsedAt: file.lastUsedAt, writtenPath: file.writtenPath };
	}
	return { lastDestinationId: settings.lastDestinationId, files };
}

export function sharedSettings(settings: CaptureSettings): Omit<CaptureSettings, "lastDestinationId"> {
	const { lastDestinationId: _, ...shared } = structuredClone(settings);
	for (const mode of shared.modes) {
		if (mode.target.type !== "files") continue;
		mode.target.files = mode.target.files.map(({ lastUsedAt: _used, writtenPath: _written, ...file }): SharedFile => file) as ModeFile[];
	}
	return shared;
}

export function applyUsage(settings: CaptureSettings, usage: DeviceUsage | null): void {
	if (usage) settings.lastDestinationId = usage.lastDestinationId;
	for (const file of modeFiles(settings)) {
		if (!usage) {
			file.lastUsedAt ??= 0;
			continue;
		}
		const used = usage.files[file.id];
		file.lastUsedAt = used?.lastUsedAt ?? 0;
		if (used?.writtenPath === undefined) delete file.writtenPath;
		else file.writtenPath = used.writtenPath;
	}
}

function modeFiles(settings: CaptureSettings): ModeFile[] {
	return settings.modes.flatMap((mode) => (mode.target.type === "files" ? mode.target.files : []));
}
