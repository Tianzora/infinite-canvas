import axios from "axios";

import { dataUrlToFile } from "@/lib/image-utils";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildSeedancePromptText, isSeedanceVideoConfig, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedanceVideoReferenceError, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { isAgnesVideoModel } from "@/lib/agnes-model";
import { buildApiUrl, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = {
    id?: string;
    task_id?: string;
    video_id?: string;
    status?: string;
    error?: { message?: string } | string;
    remixed_from_video_id?: unknown;
    video_url?: unknown;
    output?: unknown;
    result?: unknown;
    content?: { video_url?: unknown } | null;
};
type ApiVideoResponse = VideoResponse | { code?: number; data?: VideoResponse | null; msg?: string };
type SeedanceTask = {
    id?: string;
    task_id?: string;
    video_id?: string;
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
    error?: { code?: string; message?: string } | null;
    content?: { video_url?: string; last_frame_url?: string } | null;
};
type ApiEnvelope<T> = T | { code?: number; data?: T | null; msg?: string };
type ReferenceMediaUploadResponse = { id: string; url: string; mimeType: string; bytes: number };
type RequestOptions = { signal?: AbortSignal };

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; taskId?: string; videoId?: string; provider: "openai" | "seedance" | "agnes"; model: string };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

const AGNES_VIDEO_FRAME_RATE = 24;
const AGNES_VIDEO_FRAME_OPTIONS = [81, 121, 161, 241, 361, 441];

function aiApiUrl(config: AiConfig, path: string) {
    return config.channelMode === "remote" ? `/api/v1${path}` : buildApiUrl(config.baseUrl, path);
}

function videoIdApiUrl(config: AiConfig) {
    return config.channelMode === "remote" ? "/api/v1/agnesapi" : `${videoIdApiBaseUrl(config.baseUrl)}/agnesapi`;
}

function videoIdApiBaseUrl(baseUrl: string) {
    return baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function aiHeaders(config: AiConfig, contentType?: string) {
    const token = useUserStore.getState().token;
    return config.channelMode === "remote"
        ? {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(contentType ? { "Content-Type": contentType } : {}),
          }
        : {
              Authorization: `Bearer ${config.apiKey}`,
              ...(contentType ? { "Content-Type": contentType } : {}),
          };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationResult> {
    const task = await createVideoGenerationTask(config, prompt, references, videoReferences, audioReferences, options);
    const delayMs = 5000;
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, options);
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw new Error(state.error);
        if (attempt === 119) throw new Error(`${task.provider === "seedance" ? "Seedance " : ""}视频生成超时，请稍后重试`);
        await delay(delayMs, options?.signal);
    }
    throw new Error("视频生成超时，请稍后重试");
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const model = requestConfig.model;
    assertVideoConfig(requestConfig, model);
    if (isAgnesVideoModel(model)) {
        return createAgnesVideoTask(requestConfig, model, prompt, references, videoReferences, audioReferences);
    }
    if (isSeedanceVideoConfig({ ...requestConfig, model })) {
        return createSeedanceTask(requestConfig, model, prompt, references, videoReferences, audioReferences);
    }
    if (videoReferences.length || audioReferences.length) {
        throw new Error("当前视频接口不支持参考视频或参考音频，请切换到 Seedance 2.0 / 火山 Agent Plan 模型，或移除参考素材");
    }
    return createOpenAIVideoTask(requestConfig, model, prompt, references);
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    assertVideoConfig(config, task.model);
    if (task.videoId) return pollVideoIdTask(config, task);
    return task.provider === "seedance" ? pollSeedanceTask(config, task) : pollOpenAIVideoTask(config, task);
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
    throw new Error("视频接口没有返回可播放的视频");
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[]): Promise<VideoGenerationTask> {
    const body = new FormData();
    body.append("model", model);
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append("input_reference[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config) })).data);
        const taskId = taskIdFromResponse(created);
        if (!taskId) throw new Error("视频接口没有返回任务 ID");
        return { id: taskId, taskId, videoId: videoIdFromResponse(created), provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务创建失败"));
    }
}

async function createAgnesVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]): Promise<VideoGenerationTask> {
    if (videoReferences.length || audioReferences.length) throw new Error("Agnes 视频模型暂不支持参考视频或参考音频，请仅使用文本或参考图");
    const size = normalizeAgnesVideoSize(config.size);
    const payload: Record<string, unknown> = {
        model,
        prompt,
        width: size.width,
        height: size.height,
        frame_rate: AGNES_VIDEO_FRAME_RATE,
        num_frames: agnesNumFrames(config.videoSeconds),
    };
    if (references.length) {
        payload.image = await resolveAgnesReferenceImageUrl(config, references[0]);
        payload.mode = "image";
        payload.extra_body = { image: [payload.image], mode: "image" };
    } else {
        payload.mode = "text";
    }
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), payload, { headers: aiHeaders(config, "application/json") })).data);
        const taskId = taskIdFromResponse(created);
        const videoId = videoIdFromResponse(created);
        if (!taskId && !videoId) throw new Error("Agnes 视频接口没有返回任务 ID");
        return { id: videoId || taskId, taskId, videoId, provider: "agnes", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "Agnes 视频任务创建失败"));
    }
}

async function pollVideoIdTask(config: AiConfig, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    try {
        logVideoQuery("video_id", task);
        const video = unwrapVideoResponse(
            (
                await axios.get<ApiVideoResponse>(videoIdApiUrl(config), {
                    headers: aiHeaders(config),
                    params: config.channelMode === "remote" ? { model: task.model, video_id: task.videoId } : { video_id: task.videoId },
                })
            ).data,
        );
        return videoStateFromResponse(config, task, video);
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务查询失败"));
    }
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    try {
        logVideoQuery("task_id", task);
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${encodeURIComponent(task.taskId || task.id)}`), { headers: aiHeaders(config), params: config.channelMode === "remote" ? { model: task.model } : undefined })).data);
        return videoStateFromResponse(config, task, video);
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务查询失败"));
    }
}

async function videoStateFromResponse(config: AiConfig, task: VideoGenerationTask, video: VideoResponse): Promise<VideoGenerationTaskState> {
    const directUrl = extractVideoUrl(video);
    if (isCompletedVideoStatus(video.status) || (!video.status && directUrl)) {
        refreshRemoteUser(config);
        if (directUrl) return { status: "completed", result: await videoResultFromUrl(directUrl) };
        const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${encodeURIComponent(task.taskId || task.id)}/content`), { headers: aiHeaders(config), params: config.channelMode === "remote" ? { model: task.model } : undefined, responseType: "blob" });
        await assertVideoBlob(content.data);
        return { status: "completed", result: { blob: content.data } };
    }
    if (isFailedVideoStatus(video.status)) return { status: "failed", error: videoErrorMessage(video.error) || "视频生成失败" };
    return { status: "pending" };
}

async function createSeedanceTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]): Promise<VideoGenerationTask> {
    if (audioReferences.length && !references.length && !videoReferences.length) {
        throw new Error("Seedance 参考音频不能单独使用，请同时添加参考图或参考视频");
    }
    assertSeedanceVideoReferences(videoReferences);
    assertSeedanceAudioReferences(audioReferences);
    const content = await buildSeedanceContent(config, prompt, references, videoReferences, audioReferences);
    if (!content.length) throw new Error("请输入视频提示词，或连接参考图片/视频/音频");
    const payload = {
        model,
        content,
        ratio: normalizeSeedanceRatio(config.size),
        resolution: normalizeSeedanceResolution(config.vquality, model),
        duration: normalizeSeedanceDuration(config.videoSeconds),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
    };

    try {
        const created = unwrapSeedanceTask((await axios.post<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config), payload, { headers: aiHeaders(config, "application/json") })).data);
        const taskId = taskIdFromResponse(created);
        if (!taskId) throw new Error("Seedance 接口没有返回任务 ID");
        return { id: taskId, taskId, videoId: videoIdFromResponse(created), provider: "seedance", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务创建失败"));
    }
}

async function pollSeedanceTask(config: AiConfig, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    try {
        logVideoQuery("task_id", task);
        const state = unwrapSeedanceTask((await axios.get<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, task.taskId || task.id), { headers: aiHeaders(config), params: config.channelMode === "remote" ? { model: task.model } : undefined })).data);
        if (state.status === "succeeded") {
            const url = state.content?.video_url;
            if (!url) return { status: "failed", error: "Seedance 任务成功但没有返回视频 URL" };
            refreshRemoteUser(config);
            return { status: "completed", result: await videoResultFromUrl(url) };
        }
        if (state.status === "failed" || state.status === "cancelled" || state.status === "expired") return { status: "failed", error: state.error?.message || `Seedance 视频生成${state.status === "expired" ? "超时" : "失败"}` };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务查询失败"));
    }
}

function assertSeedanceVideoReferences(videoReferences: ReferenceVideo[]) {
    const error = seedanceVideoReferenceError(videoReferences);
    if (error) throw new Error(error);
    let total = 0;
    for (const video of videoReferences) {
        if (!video.durationMs) continue;
        if (video.durationMs < 2000 || video.durationMs > 15000) throw new Error("Seedance 参考视频单个时长需要在 2-15 秒之间");
        total += video.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考视频总时长不能超过 15 秒");
}

function assertSeedanceAudioReferences(audioReferences: ReferenceAudio[]) {
    let total = 0;
    for (const audio of audioReferences) {
        if (!audio.durationMs) continue;
        if (audio.durationMs < 2000 || audio.durationMs > 15000) throw new Error("Seedance 参考音频单个时长需要在 2-15 秒之间");
        total += audio.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考音频总时长不能超过 15 秒");
}

function seedanceApiUrl(config: AiConfig, taskId?: string) {
    if (config.channelMode === "remote") return taskId ? `/api/v1/videos/${encodeURIComponent(taskId)}` : "/api/v1/videos";
    return buildApiUrl(config.baseUrl, `/contents/generations/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ""}`);
}

async function buildSeedanceContent(config: AiConfig, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    const content: Array<Record<string, unknown>> = [];
    const text = buildSeedancePromptText(prompt, references, videoReferences, audioReferences);
    if (text) content.push({ type: "text", text });
    for (const image of references.slice(0, SEEDANCE_REFERENCE_LIMITS.images)) {
        content.push({ type: "image_url", image_url: { url: await resolveSeedanceImageUrl(config, image) }, role: "reference_image" });
    }
    for (const video of videoReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.videos)) {
        content.push({ type: "video_url", video_url: { url: await resolveSeedanceVideoUrl(video) }, role: "reference_video" });
    }
    for (const audio of audioReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.audios)) {
        content.push({ type: "audio_url", audio_url: { url: await resolveSeedanceAudioUrl(audio) }, role: "reference_audio" });
    }
    return content;
}

async function resolveSeedanceImageUrl(config: AiConfig, image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl) || directUrl.startsWith("asset://")) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    if (config.channelMode === "remote") {
        return uploadReferenceMedia(dataUrlToFile({ ...image, dataUrl }));
    }
    return dataUrl;
}

async function resolveAgnesReferenceImageUrl(config: AiConfig, image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl)) return directUrl;
    if (config.channelMode !== "remote") throw new Error("Agnes 图生视频参考图必须是公网 URL；本地模式不会新增公网服务，请使用已公开的图片地址或切换到服务端渠道");
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    const url = await uploadReferenceMedia(dataUrlToFile({ ...image, dataUrl }));
    if (!isPublicMediaUrl(url)) throw new Error("参考图上传后没有生成公网 URL，请检查 PUBLIC_BASE_URL");
    return url;
}

async function resolveSeedanceVideoUrl(video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url) || video.url.startsWith("asset://")) return video.url;
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("参考视频必须是公网 URL、素材 ID，或本地已保存的视频");
    const file = new File([blob], video.name || "reference-video.mp4", { type: video.type || blob.type || "video/mp4" });
    return uploadReferenceMedia(file);
}

async function resolveSeedanceAudioUrl(audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url) || audio.url.startsWith("asset://")) return audio.url;
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("参考音频必须是公网 URL、素材 ID，或本地已保存的音频");
    const file = new File([blob], audio.name || "reference-audio.mp3", { type: audio.type || blob.type || "audio/mpeg" });
    return uploadReferenceMedia(file);
}

async function uploadReferenceMedia(file: File) {
    const token = useUserStore.getState().token;
    if (!token) throw new Error("使用本地参考素材需要先登录，并在服务端配置 PUBLIC_BASE_URL；本项目不会新增对象存储或额外公网服务");
    const body = new FormData();
    body.append("file", file, file.name);
    const response = await axios.post<ApiEnvelope<ReferenceMediaUploadResponse>>("/api/v1/media/references", body, { headers: { Authorization: `Bearer ${token}` } });
    const payload = unwrapEnvelope(response.data, "参考素材上传失败");
    if (!payload.url) throw new Error("参考素材上传后没有返回公网 URL");
    return payload.url;
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先配置视频模型");
    if (config.channelMode === "local" && !config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (config.channelMode === "local" && !config.apiKey.trim()) throw new Error("请先配置 API Key");
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeAgnesVideoSize(value: string) {
    const fallback = { width: 1152, height: 768 };
    const size = normalizeVideoSize(value);
    if (!size) return fallback;
    const match = size.match(/^(\d+)x(\d+)$/);
    if (!match) return fallback;
    return {
        width: alignToStep(Number(match[1]) || fallback.width, 64),
        height: alignToStep(Number(match[2]) || fallback.height, 64),
    };
}

function agnesNumFrames(value: string) {
    const seconds = Math.max(1, Math.min(18, Math.floor(Number(value) || 5)));
    const target = seconds * AGNES_VIDEO_FRAME_RATE;
    return AGNES_VIDEO_FRAME_OPTIONS.reduce((best, item) => (Math.abs(item - target) < Math.abs(best - target) ? item : best), AGNES_VIDEO_FRAME_OPTIONS[0]);
}

function alignToStep(value: number, step: number) {
    return Math.max(step, Math.round(value / step) * step);
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, "接口没有返回视频任务");
}

function unwrapSeedanceTask(payload: ApiEnvelope<SeedanceTask>) {
    return unwrapEnvelope(payload, "Seedance 接口没有返回任务");
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && typeof payload.code === "number") {
        if (payload.code !== 0) throw new Error(payload.msg || "请求失败");
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; code?: number }>(error)) {
        const responseData = error.response?.data;
        return responseData?.msg || responseData?.error?.message || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    return error instanceof Error ? error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}

function taskIdFromResponse(payload: { id?: string; task_id?: string }) {
    return String(payload.task_id || payload.id || "").trim();
}

function videoIdFromResponse(payload: { video_id?: string }) {
    return String(payload.video_id || "").trim() || undefined;
}

function isCompletedVideoStatus(status: string | undefined) {
    return ["completed", "succeeded", "success", "done"].includes((status || "").toLowerCase());
}

function isFailedVideoStatus(status: string | undefined) {
    return ["failed", "cancelled", "canceled", "expired", "error"].includes((status || "").toLowerCase());
}

function videoErrorMessage(error: VideoResponse["error"]) {
    return typeof error === "string" ? error : error?.message;
}

function extractVideoUrl(payload: VideoResponse) {
    return videoUrlFromValue(payload.remixed_from_video_id) || videoUrlFromValue(payload.video_url) || videoUrlFromValue(payload.output) || videoUrlFromValue(payload.result) || videoUrlFromValue(payload.content?.video_url);
}

function videoUrlFromValue(value: unknown): string {
    if (typeof value === "string") {
        const url = value.trim();
        return /^(https?:|blob:|data:video\/)/i.test(url) ? url : "";
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const url = videoUrlFromValue(item);
            if (url) return url;
        }
    }
    if (value && typeof value === "object") {
        const item = value as Record<string, unknown>;
        return videoUrlFromValue(item.video_url) || videoUrlFromValue(item.url) || videoUrlFromValue(item.output) || videoUrlFromValue(item.result);
    }
    return "";
}

function logVideoQuery(mode: "video_id" | "task_id", task: VideoGenerationTask) {
    console.info("[video] polling task", { mode, provider: task.provider, model: task.model });
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "视频下载失败");
    if (payload.error?.message) throw new Error(payload.error.message);
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取本地素材失败"));
        reader.readAsDataURL(blob);
    });
}
