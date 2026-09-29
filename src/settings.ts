export type AfterSend = "close" | "stay";

export interface CaptureSettings {
	heading: string;
	textPrefix: string;
	textSuffix: string;
	audioPrefix: string;
	audioSuffix: string;
	embedAudio: boolean;
	afterSend: AfterSend;
}

export const DEFAULT_SETTINGS: CaptureSettings = {
	heading: "",
	textPrefix: "- {{time}} ",
	textSuffix: "",
	audioPrefix: "- {{time}} ",
	audioSuffix: "",
	embedAudio: true,
	afterSend: "close",
};
