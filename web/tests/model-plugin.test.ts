import { expect, test } from "bun:test";

import { normalizePluginAudio, normalizePluginImages, normalizePluginText, normalizePluginVideo, runModelPlugin } from "../src/services/api/model-plugin";
import { createModelChannel, defaultConfig } from "../src/stores/use-config-store";

const config = { ...defaultConfig, baseUrl: "https://example.com", apiKey: "test-key", model: "demo-model", systemPrompt: "system" };

test("model script receives flat request variables without a remote call", async () => {
    const result = await runModelPlugin({
        capability: "text",
        script: "return { prompt, model, baseUrl, apiKey, systemPrompt, params, messages, images };",
        config,
        prompt: "hello",
        images: ["data:image/png;base64,ref"],
        messages: [{ role: "user", content: "hello" }],
        params: { temperature: 0.2 },
    });

    expect(result).toEqual({
        prompt: "hello",
        model: "demo-model",
        baseUrl: "https://example.com",
        apiKey: "test-key",
        systemPrompt: "system",
        params: { temperature: 0.2 },
        messages: [{ role: "user", content: "hello" }],
        images: ["data:image/png;base64,ref"],
    });
});

test("normalizes image, video, audio, and text script results", async () => {
    expect(normalizePluginImages([{ b64_json: "abc" }, { url: "https://example.com/image.png" }])).toEqual(["data:image/png;base64,abc", "https://example.com/image.png"]);
    expect(normalizePluginVideo({ url: "https://example.com/video.mp4" })).toEqual({ url: "https://example.com/video.mp4", mimeType: "video/mp4" });
    expect(normalizePluginText({ output_text: "answer" })).toBe("answer");

    const audio = await normalizePluginAudio(new Blob(["audio"], { type: "application/octet-stream" }), "audio/mpeg");
    expect(audio.type).toBe("audio/mpeg");
});

test("preserves per-channel scripts and forwards text deltas", async () => {
    const channel = createModelChannel({ models: ["demo-model"], modelScripts: { "demo-model": "return prompt;" } });
    expect(channel.modelScripts).toEqual({ "demo-model": "return prompt;" });

    const deltas: string[] = [];
    const result = await runModelPlugin({
        capability: "text",
        script: "onDelta('partial'); return { content: 'answer' };",
        config,
        onDelta: (text) => deltas.push(text),
    });
    expect(deltas).toEqual(["partial"]);
    expect(normalizePluginText(result)).toBe("answer");
});

test("abort errors pass through the model script runner", async () => {
    const controller = new AbortController();
    const promise = runModelPlugin({ capability: "text", script: "await sleep(1000); return 'done';", config, signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
});
