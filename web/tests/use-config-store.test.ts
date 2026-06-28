import { expect, test } from "bun:test";

import { resolveModelRequestConfig, useConfigStore, type AiConfig } from "../src/stores/use-config-store";

test("remote model request keeps displayName for backend channel selection", () => {
    useConfigStore.setState({
        publicSettings: {
            modelChannel: {
                availableModels: ["gpt-image-2-1k", "gpt-image-2-2k"],
                modelAliases: [
                    { model: "gpt-image-2", displayName: "gpt-image-2-1k" },
                    { model: "gpt-image-2", displayName: "gpt-image-2-2k" },
                ],
                modelProtocols: [
                    { model: "gpt-image-2-1k", protocol: "openai" },
                    { model: "gpt-image-2-2k", protocol: "openai" },
                ],
                modelCosts: [],
                defaultModel: "",
                defaultImageModel: "gpt-image-2-2k",
                defaultVideoModel: "",
                defaultTextModel: "",
                systemPrompt: "",
                allowCustomChannel: true,
            },
            auth: { allowRegister: true, linuxDo: { enabled: false } },
            billing: { rechargeUrl: "" },
        },
    });

    const request = resolveModelRequestConfig(
        {
            channelMode: "remote",
            model: "gpt-image-2-2k",
            imageModel: "gpt-image-2-2k",
            videoModel: "",
            textModel: "",
            audioModel: "",
            audioVoice: "alloy",
            audioFormat: "mp3",
            audioSpeed: "1",
            audioInstructions: "",
            videoSeconds: "6",
            vquality: "720",
            videoGenerateAudio: "true",
            videoWatermark: "false",
            baseUrl: "",
            apiKey: "",
            channels: [],
            systemPrompt: "",
            models: ["gpt-image-2-1k", "gpt-image-2-2k"],
            imageModels: ["gpt-image-2-1k", "gpt-image-2-2k"],
            videoModels: [],
            textModels: [],
            audioModels: [],
            quality: "auto",
            size: "1:1",
            count: "1",
            canvasImageCount: "3",
        } satisfies AiConfig,
        "gpt-image-2-2k",
    );

    expect(request.model).toBe("gpt-image-2-2k");
});
