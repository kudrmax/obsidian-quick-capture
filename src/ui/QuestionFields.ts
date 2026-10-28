import { setIcon } from "obsidian";
import { Answer } from "../application/CaptureService";
import { AudioRecording } from "../application/ports";
import { Question } from "../domain/CaptureMode";

export interface Editor {
	textarea: HTMLTextAreaElement;
	highlight: HTMLElement;
}

interface Field extends Editor {
	question: Question;
	el: HTMLElement;
	voiceEl: HTMLElement;
	recording: AudioRecording | null;
}

interface QuestionFieldsOptions {
	decorate: (textarea: HTMLTextAreaElement) => void;
	onFocus: (editor: Editor) => void;
	onInput: () => void;
}

export class QuestionFields {
	private readonly el: HTMLElement;
	private fields: Field[] = [];
	private current: Field | null = null;

	constructor(parent: HTMLElement, private readonly options: QuestionFieldsOptions) {
		this.el = parent.createDiv({ cls: "dqc-fields" });
	}

	show(questions: Question[]): Editor[] {
		this.el.empty();
		this.fields = questions.map((question) => this.createField(question));
		this.current = this.fields[0] ?? null;
		return this.fields;
	}

	hasQuestions(): boolean {
		return this.fields.length > 0;
	}

	currentEditor(): Editor | null {
		return this.current;
	}

	currentQuestion(): string {
		return this.current?.question.text.trim() ?? "";
	}

	hasVoiceAnswer(): boolean {
		return this.current?.recording != null;
	}

	canSend(): boolean {
		const answered = this.fields.map((field) => hasAnswer(field));
		return answered.some(Boolean) && this.fields.every((field, index) => !field.question.required || answered[index]);
	}

	answers(): Answer[] {
		return this.fields.map((field): Answer =>
			field.recording ? { kind: "audio", recording: field.recording } : { kind: "text", text: field.textarea.value },
		);
	}

	keepVoiceAnswer(recording: AudioRecording, duration: string): void {
		const field = this.current;
		if (!field) return;
		field.recording = recording;
		field.el.addClass("has-voice");
		field.voiceEl.empty();
		setIcon(field.voiceEl.createSpan(), "mic");
		field.voiceEl.appendText(`Voice answer · ${duration}`);
		markFilled(field);
	}

	removeVoiceAnswer(): void {
		const field = this.current;
		if (!field) return;
		field.recording = null;
		field.el.removeClass("has-voice");
		field.voiceEl.empty();
		markFilled(field);
	}

	setReadOnly(readOnly: boolean): void {
		for (const field of this.fields) field.textarea.readOnly = readOnly;
	}

	private createField(question: Question): Field {
		const el = this.el.createDiv({ cls: "dqc-field" });
		el.createDiv({ cls: "dqc-question", text: question.text.trim() });
		const editorEl = el.createDiv({ cls: "dqc-editor" });
		const highlight = editorEl.createDiv({ cls: "dqc-highlight", attr: { "aria-hidden": "true" } });
		const textarea = editorEl.createEl("textarea", {
			cls: "dqc-text",
			attr: { rows: "1", placeholder: question.text.trim(), "aria-label": question.text.trim() },
		});
		const voiceEl = el.createDiv({ cls: "dqc-voice" });
		const field: Field = { question, el, textarea, highlight, voiceEl, recording: null };
		textarea.addEventListener("focus", () => this.select(field));
		textarea.addEventListener("input", () => {
			markFilled(field);
			this.options.onInput();
		});
		textarea.addEventListener("scroll", () => (highlight.scrollTop = textarea.scrollTop));
		voiceEl.addEventListener("click", () => this.select(field));
		this.options.decorate(textarea);
		return field;
	}

	private select(field: Field): void {
		this.current = field;
		this.options.onFocus(field);
	}
}

function markFilled(field: Field): void {
	field.el.toggleClass("is-filled", hasAnswer(field));
}

function hasAnswer(field: Field): boolean {
	return field.recording !== null || field.textarea.value.trim() !== "";
}
