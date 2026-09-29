import { Vault } from "obsidian";

export async function ensureParentFolder(vault: Vault, path: string): Promise<void> {
	const segments = path.split("/").slice(0, -1);
	for (let i = 1; i <= segments.length; i++) {
		const folder = segments.slice(0, i).join("/");
		if (!vault.getFolderByPath(folder)) await vault.createFolder(folder);
	}
}
