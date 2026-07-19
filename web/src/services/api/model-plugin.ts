import axios, { type AxiosRequestConfig } from "axios";

import { buildApiUrl, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

type RequestOptions = { signal?: AbortSignal };

export type PluginHttpOptions = {
    headers?: Record<string, string>;
    params?: Record<string, unknown>;
    responseType?: "json" | "blob" | "text" | "arraybuffer";
};

export type PluginHttp = {
    url: (path: string) => string;
    post: (path: string, body?: unknown, options?: PluginHttpOptions) => Promise<unknown>;
    get: (path: string, options?: PluginHttpOptions) => Promise<unknown>;
};

export type PluginPollOptions = { intervalMs?: number; timeoutMs?: number };

export type RunPluginArgs = {
    capability: ModelCapability;
    script: string;
    config: AiConfig;
    prompt?: string;
    images?: string[];
    messages?: unknown[];
    params?: Record<string, unknown>;
    signal?: AbortSignal;
    onDelta?: (text: string) => void;
};

function pluginUrl(config: AiConfig, path: string) {
    if (/^https?:/i.test(path)) return path;
    return buildApiUrl(config.baseUrl, path.startsWith("/") ? path : `/${path}`);
}

function createPluginHttp(config: AiConfig, options?: RequestOptions): PluginHttp {
    const run = async (method: "get" | "post", path: string, body: unknown, opts?: PluginHttpOptions) => {
        const isForm = typeof FormData !== "undefined" && body instanceof FormData;
        const response = await axios.request({
            method,
            url: pluginUrl(config, path),
            data: method === "post" ? body : undefined,
            params: opts?.params,
            headers: {
                ...(method === "post" && !isForm && body !== undefined ? { "Content-Type": "application/json" } : {}),
                Authorization: `Bearer ${config.apiKey}`,
                ...opts?.headers,
            },
            responseType: opts?.responseType || "json",
            signal: options?.signal,
        });
        return response.data;
    };
    return {
        url: (path) => pluginUrl(config, path),
        post: (path, body, opts) => run("post", path, body, opts),
        get: (path, opts) => run("get", path, undefined, opts),
    };
}

function createPluginRequest(config: AiConfig, options?: RequestOptions) {
    return async (requestConfig: AxiosRequestConfig & { url: string }) => {
        const response = await axios.request({ ...requestConfig, url: pluginUrl(config, requestConfig.url), signal: options?.signal });
        return response.data;
    };
}

function sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}

function createPoll(signal?: AbortSignal) {
    return async function poll<T, R>(request: () => Promise<T>, extract: (value: T) => R | null | undefined | false, options?: PluginPollOptions): Promise<R> {
        const intervalMs = options?.intervalMs ?? 2500;
        const timeoutMs = options?.timeoutMs ?? 300000;
        const deadline = performance.now() + timeoutMs;
        for (;;) {
            if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
            const result = extract(await request());
            if (result !== null && result !== undefined && result !== false) return result;
            if (performance.now() >= deadline) throw new Error("插件轮询超时，请检查调用脚本或稍后重试");
            await sleep(intervalMs, signal);
        }
    };
}

export async function runModelPlugin<T = unknown>(args: RunPluginArgs): Promise<T> {
    const http = createPluginHttp(args.config, { signal: args.signal });
    const request = createPluginRequest(args.config, { signal: args.signal });
    const poll = createPoll(args.signal);
    const runner = new Function(
        "prompt", "images", "messages", "params", "model", "baseUrl", "apiKey", "systemPrompt", "http", "request", "poll", "sleep", "signal", "onDelta",
        `"use strict"; return (async () => {\n${args.script}\n})();`,
    ) as (...values: unknown[]) => Promise<T>;
    try {
        return await runner(
            args.prompt || "",
            args.images || [],
            args.messages || [],
            args.params || {},
            args.config.model,
            args.config.baseUrl,
            args.config.apiKey,
            args.config.systemPrompt || "",
            http,
            request,
            poll,
            (ms: number) => sleep(ms, args.signal),
            args.signal,
            args.onDelta,
        );
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        if (axios.isCancel(error)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`模型调用脚本执行失败：${message}`);
    }
}

export type PluginVariable = { name: string; type: string; desc: string; capabilities?: ModelCapability[] };

export const PLUGIN_VARIABLES: PluginVariable[] = [
    { name: "prompt", type: "string", desc: "用户输入的提示词（已拼接系统提示词）", capabilities: ["image", "video", "audio"] },
    { name: "images", type: "string[]", desc: "参考图，dataURL 数组（改图 / 图生视频时有值）", capabilities: ["image", "video"] },
    { name: "messages", type: "{ role, content }[]", desc: "对话消息数组，含系统消息", capabilities: ["text"] },
    { name: "params", type: "object", desc: "生成参数：生图 {size,quality,count}、视频 {seconds,size,resolution,ratio,generateAudio,watermark}、音频 {voice,format,speed,instructions}" },
    { name: "model", type: "string", desc: "模型名称（不含渠道前缀）" },
    { name: "baseUrl", type: "string", desc: "渠道接口地址（原样，未拼 /v1）" },
    { name: "apiKey", type: "string", desc: "渠道 API Key，请求头里自己带上" },
    { name: "systemPrompt", type: "string", desc: "系统提示词原文" },
    { name: "http", type: "object", desc: "便捷请求：http.post(path, body, {headers,params,responseType})、http.get(path, opts)、http.url(path)；默认带 Authorization: Bearer apiKey，可用 headers 覆盖；path 相对时按 baseUrl 拼 /v1" },
    { name: "request", type: "function", desc: "原始请求 request({ method, url, headers, params, data, responseType })，不加任何默认头，鉴权头自己写；url 相对时按 baseUrl 拼接（不加 /v1）" },
    { name: "poll", type: "function", desc: "轮询 poll(request, extract, {intervalMs,timeoutMs})，extract 返回真值即结束" },
    { name: "sleep", type: "function", desc: "sleep(ms) 延时" },
    { name: "signal", type: "AbortSignal", desc: "取消信号，可透传给 http/request" },
    { name: "onDelta", type: "function", desc: "onDelta(text) 推送流式文本（文本模型）", capabilities: ["text"] },
];

export const PLUGIN_RETURNS: Record<ModelCapability, string> = {
    image: "文生图（images 为空）和图生图（images 有参考图）接口不同，脚本需自行区分；返回图片 URL 或 dataURL 字符串，也可返回它们的数组，或 [{ dataUrl }] / [{ url }] / [{ b64_json }]",
    video: "脚本内部完成轮询，返回 { url } 或 { blob } 或视频 URL 字符串",
    audio: "返回 Blob，或 base64 / dataURL 字符串，或 { b64_json } / { data } / { url }",
    text: "用 onDelta(text) 推送流式，最终 return 完整文本字符串",
};

export type PluginTemplate = { label: string; script: string };

export const PLUGIN_TEMPLATES: Record<ModelCapability, PluginTemplate[]> = {
    image: [{ label: "OpenAI 图片", script: `const data = await request({ method: "post", url: \`${"${baseUrl}"}/v1/images/generations\`, headers: { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` }, data: { model, prompt, n: params.count, size: params.size, response_format: "b64_json" } });\nreturn (data.data || []).map((item) => item.b64_json ? \`data:image/png;base64,\${item.b64_json}\` : item.url);` }],
    video: [{ label: "OpenAI 视频", script: `const task = await request({ method: "post", url: \`${"${baseUrl}"}/v1/videos\`, headers: { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` }, data: { model, prompt, seconds: params.seconds } });\nreturn await poll(() => request({ method: "get", url: \`${"${baseUrl}"}/v1/videos/\${task.id}\`, headers: { Authorization: \`Bearer \${apiKey}\` } }), (state) => state.status === "completed" ? { url: state.video_url || state.url } : null);` }],
    audio: [{ label: "OpenAI 音频", script: `return await request({ method: "post", url: \`${"${baseUrl}"}/v1/audio/speech\`, headers: { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` }, responseType: "blob", data: { model, input: prompt, voice: params.voice, response_format: params.format, speed: Number(params.speed) } });` }],
    text: [{ label: "OpenAI 文本", script: `const data = await request({ method: "post", url: \`${"${baseUrl}"}/v1/responses\`, headers: { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` }, data: { model, input: messages } });\nconst text = data.output_text || "";\nonDelta(text);\nreturn text;` }],
};

PLUGIN_TEMPLATES.image[0] = {
    label: "OpenAI 规范",
    script: [
        "if (images.length === 0) {",
        "  const data = await request({ method: \"post\", url: baseUrl + \"/v1/images/generations\", headers: { \"Content-Type\": \"application/json\", Authorization: \"Bearer \" + apiKey }, data: { model, prompt, n: params.count, size: params.size, response_format: \"b64_json\" } });",
        "  return (data.data || []).map((item) => item.b64_json ? \"data:image/png;base64,\" + item.b64_json : item.url);",
        "}",
        "const form = new FormData();",
        "form.set(\"model\", model);",
        "form.set(\"prompt\", prompt);",
        "form.set(\"n\", String(params.count));",
        "form.set(\"response_format\", \"b64_json\");",
        "for (const dataUrl of images) form.append(\"image\", await (await fetch(dataUrl)).blob(), \"ref.png\");",
        "const edited = await request({ method: \"post\", url: baseUrl + \"/v1/images/edits\", headers: { Authorization: \"Bearer \" + apiKey }, data: form });",
        "return (edited.data || []).map((item) => item.b64_json ? \"data:image/png;base64,\" + item.b64_json : item.url);",
    ].join("\n"),
};
PLUGIN_TEMPLATES.image.push({
    label: "Gemini 规范",
    script: [
        "const parts = [{ text: prompt }];",
        "for (const dataUrl of images) {",
        "  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);",
        "  if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });",
        "}",
        "const data = await request({ method: \"post\", url: baseUrl + \"/v1beta/models/\" + model + \":generateContent\", headers: { \"Content-Type\": \"application/json\", \"x-goog-api-key\": apiKey }, data: { contents: [{ role: \"user\", parts }], generationConfig: { responseModalities: [\"IMAGE\"] } } });",
        "return (data.candidates || []).flatMap((c) => c.content?.parts || []).map((p) => p.inlineData || p.inline_data).filter(Boolean).map((img) => \"data:\" + (img.mimeType || img.mime_type || \"image/png\") + \";base64,\" + img.data);",
    ].join("\n"),
});
PLUGIN_TEMPLATES.video[0].label = "OpenAI 规范";
PLUGIN_TEMPLATES.video.push({
    label: "Gemini 规范",
    script: [
        "const headers = { \"Content-Type\": \"application/json\", \"x-goog-api-key\": apiKey };",
        "const instance = { prompt };",
        "const first = images[0] && images[0].match(/^data:([^;]+);base64,(.*)$/);",
        "if (first) instance.image = { bytesBase64Encoded: first[2], mimeType: first[1] };",
        "const op = await request({ method: \"post\", url: baseUrl + \"/v1beta/models/\" + model + \":predictLongRunning\", headers, data: { instances: [instance], parameters: { aspectRatio: params.ratio } } });",
        "return await poll(() => request({ method: \"get\", url: baseUrl + \"/v1beta/\" + op.name, headers }), (state) => { if (!state.done) return null; const uri = state.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri; if (!uri) throw new Error(\"Gemini 未返回视频 URI\"); return { url: uri.includes(\"key=\") ? uri : uri + (uri.includes(\"?\") ? \"&\" : \"?\") + \"key=\" + apiKey }; }, { intervalMs: 5000, timeoutMs: 300000 });",
    ].join("\n"),
});
PLUGIN_TEMPLATES.audio[0].label = "OpenAI 规范";
PLUGIN_TEMPLATES.audio.push({
    label: "Gemini 规范",
    script: [
        "const data = await request({ method: \"post\", url: baseUrl + \"/v1beta/models/\" + model + \":generateContent\", headers: { \"Content-Type\": \"application/json\", \"x-goog-api-key\": apiKey }, data: { contents: [{ role: \"user\", parts: [{ text: prompt }] }], generationConfig: { responseModalities: [\"AUDIO\"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: params.voice } } } } } });",
        "const audio = data.candidates?.[0]?.content?.parts?.map((p) => p.inlineData || p.inline_data).find(Boolean);",
        "if (!audio?.data) throw new Error(\"Gemini 未返回音频\");",
        "return { data: audio.data };",
    ].join("\n"),
});
PLUGIN_TEMPLATES.text[0].label = "OpenAI 规范";
PLUGIN_TEMPLATES.text.push({
    label: "Gemini 规范",
    script: [
        "const contents = messages.filter((m) => m.role !== \"system\").map((m) => ({ role: m.role === \"assistant\" ? \"model\" : \"user\", parts: [{ text: m.content }] }));",
        "const data = await request({ method: \"post\", url: baseUrl + \"/v1beta/models/\" + model + \":generateContent\", headers: { \"Content-Type\": \"application/json\", \"x-goog-api-key\": apiKey }, data: { contents, ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}) } });",
        "const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || \"\").join(\"\") || \"\";",
        "onDelta(text);",
        "return text;",
    ].join("\n"),
});

export function normalizePluginImages(result: unknown): string[] {
    const items = Array.isArray(result) ? result : [result];
    const urls = items.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
            const record = item as Record<string, unknown>;
            if (typeof record.dataUrl === "string") return record.dataUrl;
            if (typeof record.url === "string") return record.url;
            if (typeof record.b64_json === "string") return `data:image/png;base64,${record.b64_json}`;
            if (typeof record.data === "string" && record.data.startsWith("data:image/")) return record.data;
        }
        return "";
    }).filter(Boolean);
    if (!urls.length) throw new Error("模型调用脚本没有返回图片");
    return urls;
}

export type PluginVideoResult = { blob?: Blob; url?: string; mimeType?: string };

export function normalizePluginVideo(result: unknown): PluginVideoResult {
    if (result instanceof Blob) return { blob: result };
    if (typeof result === "string" && result) return { url: result, mimeType: "video/mp4" };
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.blob instanceof Blob) return { blob: record.blob };
        const url = [record.url, record.video_url, record.result_url].find((value): value is string => typeof value === "string" && Boolean(value));
        if (url) return { url, mimeType: "video/mp4" };
    }
    throw new Error("模型调用脚本没有返回视频");
}

export function normalizePluginText(result: unknown) {
    if (typeof result === "string") return result;
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        for (const key of ["output_text", "text", "content", "data"]) {
            if (typeof record[key] === "string") return record[key] as string;
        }
    }
    return result == null ? "" : String(result);
}

export async function normalizePluginAudio(result: unknown, mimeType: string): Promise<Blob> {
    if (result instanceof Blob) return result.type.startsWith("audio/") ? result : new Blob([result], { type: mimeType });
    let source = "";
    if (typeof result === "string") source = result;
    else if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        source = typeof record.b64_json === "string" ? record.b64_json : typeof record.data === "string" ? record.data : typeof record.url === "string" ? record.url : "";
    }
    if (!source) throw new Error("模型调用脚本没有返回音频");
    const url = source.startsWith("data:") || /^https?:/i.test(source) ? source : `data:${mimeType};base64,${source}`;
    const blob = await (await fetch(url)).blob();
    return blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: mimeType });
}
