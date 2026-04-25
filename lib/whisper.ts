import "server-only";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

let _client: OpenAI | null = null;

function client(): OpenAI {
  if (!_client) {
    _client = new OpenAI();
  }
  return _client;
}

export type WhisperResult = {
  text: string;
  language: string | null;
  duration_seconds: number | null;
  model: string;
};

export async function transcribeAudio(
  bytes: Buffer | Uint8Array,
  fileName: string,
): Promise<WhisperResult> {
  const file = await toFile(bytes, fileName);
  const res = await client().audio.transcriptions.create({
    file,
    model: TRANSCRIPTION_MODEL,
    response_format: "json",
  });
  // The SDK's typed response is `{ text: string }`; some models also return
  // `language` and `duration` fields that aren't in the static type yet.
  const raw = res as unknown as {
    text: string;
    language?: string;
    duration?: number;
  };
  return {
    text: raw.text,
    language: raw.language ?? null,
    duration_seconds: typeof raw.duration === "number" ? raw.duration : null,
    model: TRANSCRIPTION_MODEL,
  };
}

export { TRANSCRIPTION_MODEL };
