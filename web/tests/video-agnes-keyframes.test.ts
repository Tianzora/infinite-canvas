import { expect, test } from "bun:test";

import { buildAgnesVideoPayload } from "../src/services/api/video";
import type { AiConfig } from "../src/stores/use-config-store";

const baseConfig: AiConfig = {
    channelMode: "remote",
    baseUrl: "https://example.com",
    apiKey: "key",
    channels: [],
    model: "agnes-video-v2.0",
    imageModel: "gpt-image-2",
    videoModel: "agnes-video-v2.0",
    textModel: "gpt-5.5",
    audioModel: "gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoMode: "ti2vid",
    systemPrompt: "",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    audioModels: [],
    quality: "auto",
    size: "1:1",
    count: "1",
    canvasImageCount: "3",
};

test("agnes video keyframes mode sets extra_body.mode", () => {
    const payload = buildAgnesVideoPayload({ ...baseConfig, videoMode: "keyframes" }, "agnes-video-v2.0", "prompt", []);
    expect(payload.extra_body).toEqual({ mode: "keyframes" });
});

test("agnes video single reference keeps ti2vid mode", () => {
    const payload = buildAgnesVideoPayload(baseConfig, "agnes-video-v2.0", "prompt", ["https://example.com/a.png"]);
    expect(payload.mode).toBe("ti2vid");
    expect(payload.image).toBe("https://example.com/a.png");
});
