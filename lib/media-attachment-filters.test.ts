import { describe, expect, it } from "vitest";

import {
  isCompanionPhotoVoiceAudio,
  isPhotoAttachedTranscript,
} from "@/lib/media-attachment-filters";

describe("isCompanionPhotoVoiceAudio", () => {
  it("returns true when audio is the transcript storage row for a photo link", () => {
    const media = [
      { id: "p1", media_type: "photo", voice_transcription_id: "vt1" },
      { id: "a1", media_type: "audio", voice_transcription_id: null },
    ];
    const transcripts = [{ id: "vt1", media_asset_id: "a1" }];
    expect(isCompanionPhotoVoiceAudio("a1", media, transcripts)).toBe(true);
  });

  it("returns false for standalone voice audio", () => {
    const media = [
      { id: "p1", media_type: "photo", voice_transcription_id: null },
      { id: "a1", media_type: "audio", voice_transcription_id: null },
    ];
    const transcripts = [{ id: "vt1", media_asset_id: "a1" }];
    expect(isCompanionPhotoVoiceAudio("a1", media, transcripts)).toBe(false);
  });
});

describe("isPhotoAttachedTranscript", () => {
  it("returns true when a photo points at this transcript id", () => {
    const media = [
      { id: "p1", media_type: "photo", voice_transcription_id: "vt1" },
    ];
    expect(isPhotoAttachedTranscript("vt1", media)).toBe(true);
  });

  it("returns false for standalone voice transcript", () => {
    const media = [
      { id: "p1", media_type: "photo", voice_transcription_id: null },
    ];
    expect(isPhotoAttachedTranscript("vt1", media)).toBe(false);
  });
});
