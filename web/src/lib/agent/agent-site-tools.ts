import { fetchPrompts } from "@/services/api/prompts";
import { uploadImage } from "@/services/image-storage";
import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import type { CanvasAgentSnapshot } from "@/app/(user)/canvas/utils/canvas-agent-ops";
import { useAssetStore } from "@/stores/use-asset-store";
import { modelOptionLabel, modelOptionName, normalizeModelOptionValue, useConfigStore } from "@/stores/use-config-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";

export const SITE_TOOL_NAMES = [
    "site_navigate",
    "canvas_list_projects",
    "generation_get_status",
    "workbench_image_get_config",
    "workbench_image_generate",
    "workbench_video_get_config",
    "workbench_video_generate",
    "prompts_search",
    "assets_list",
    "assets_add",
] as const;

export type SiteToolName = (typeof SITE_TOOL_NAMES)[number];
type SiteToolInput = Record<string, unknown>;
type Navigate = (path: string) => void;
type SiteToolContext = { canvasSnapshot?: CanvasAgentSnapshot | null };
type GenerationStatus = "idle" | "queued" | "running" | "succeeded" | "failed";
type GenerationStatusItem = { id: string; source: "canvas" | "image" | "video"; status: GenerationStatus; kind?: string; title?: string; prompt?: string; projectId?: string; createdAt?: string; updatedAt?: string; successCount?: number; failCount?: number; error?: string };

export const SITE_TOOL_LABELS: Record<SiteToolName, string> = {
    site_navigate: "网站跳转",
    canvas_list_projects: "画布列表",
    generation_get_status: "生成任务状态",
    workbench_image_get_config: "生图配置",
    workbench_image_generate: "生图工作台生成",
    workbench_video_get_config: "视频配置",
    workbench_video_generate: "视频创作台生成",
    prompts_search: "搜索提示词",
    assets_list: "素材列表",
    assets_add: "添加素材",
};

export function isSiteTool(name: string): name is SiteToolName {
    return (SITE_TOOL_NAMES as readonly string[]).includes(name);
}

export async function runSiteTool(name: SiteToolName, input: SiteToolInput, navigate: Navigate, context: SiteToolContext = {}): Promise<unknown> {
    switch (name) {
        case "site_navigate":
            return navigateSite(input, navigate);
        case "canvas_list_projects":
            return listCanvasProjects(input);
        case "generation_get_status":
            return getGenerationStatus(input, context.canvasSnapshot);
        case "workbench_image_get_config":
            return getImageConfig();
        case "workbench_image_generate":
            return runImageWorkbench(input, navigate);
        case "workbench_video_get_config":
            return getVideoConfig();
        case "workbench_video_generate":
            return runVideoWorkbench(input, navigate);
        case "prompts_search":
            return searchPrompts(input);
        case "assets_list":
            return listAssets(input);
        case "assets_add":
            return addAsset(input);
    }
}

function getGenerationStatus(input: SiteToolInput, canvasSnapshot?: CanvasAgentSnapshot | null) {
    const scope = input.scope === "canvas" || input.scope === "image" || input.scope === "video" ? input.scope : "all";
    const taskId = typeof input.taskId === "string" ? input.taskId : "";
    const nodeIds = new Set(Array.isArray(input.nodeIds) ? input.nodeIds.filter((id): id is string => typeof id === "string") : []);
    const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit)) || 20));
    const tasks: GenerationStatusItem[] = [];
    const includeCanvas = (scope === "all" || scope === "canvas") && (!taskId || nodeIds.size > 0);
    const includeWorkbench = !nodeIds.size || Boolean(taskId);

    if (includeCanvas && canvasSnapshot) {
        canvasSnapshot.nodes.forEach((node) => {
            const status = normalizeCanvasGenerationStatus(node.metadata?.status);
            if (!status || (nodeIds.size && !nodeIds.has(node.id))) return;
            const metadata = node.metadata || {};
            if (!nodeIds.size && node.type !== "config" && status !== "running" && status !== "failed" && !metadata.generationMode && !metadata.generationType && !metadata.model) return;
            tasks.push({ id: node.id, source: "canvas", status, kind: metadata.generationMode || node.type, title: node.title, prompt: compactPrompt(metadata.prompt || metadata.composerContent), projectId: canvasSnapshot.projectId, error: metadata.errorDetails });
        });
    }

    if (includeWorkbench) {
        useWorkbenchAgentStore.getState().tasks.forEach((task) => {
            if ((scope === "image" || scope === "video") && task.kind !== scope) return;
            if (scope === "canvas" || (taskId && task.id !== taskId)) return;
            tasks.push({ ...task, source: task.kind, prompt: compactPrompt(task.prompt) });
        });
    }

    tasks.sort((a, b) => generationStatusOrder(a.status) - generationStatusOrder(b.status) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    const summary: Record<GenerationStatus, number> = { idle: 0, queued: 0, running: 0, succeeded: 0, failed: 0 };
    tasks.forEach((task) => (summary[task.status] += 1));
    return { total: tasks.length, summary, tasks: tasks.slice(0, limit) };
}

function generationStatusOrder(status: GenerationStatus) {
    return status === "running" ? 0 : status === "queued" ? 1 : 2;
}

function normalizeCanvasGenerationStatus(status: unknown): GenerationStatus | null {
    if (status === "idle") return "idle";
    if (status === "loading") return "running";
    if (status === "success") return "succeeded";
    if (status === "error") return "failed";
    return null;
}

function compactPrompt(prompt: unknown) {
    const value = typeof prompt === "string" ? prompt.trim() : "";
    return value ? `${value.slice(0, 200)}${value.length > 200 ? "..." : ""}` : undefined;
}

function navigateSite(input: SiteToolInput, navigate: Navigate) {
    const path = String(input.path || "/").trim() || "/";
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("path 必须是本站路径并以 / 开头");
    navigate(path);
    return { ok: true, navigated: path };
}

function listCanvasProjects(input: SiteToolInput) {
    const { projects, hydrated } = useCanvasStore.getState();
    if (!hydrated) throw new Error("画布还在加载中，请稍后重试");
    const keyword = String(input.keyword || "").trim().toLowerCase();
    const filtered = keyword ? projects.filter((project) => project.title.toLowerCase().includes(keyword)) : projects;
    const { page, pageSize, start, end } = paginate(input, filtered.length, 20);
    return {
        total: filtered.length,
        page,
        pageSize,
        items: filtered.slice(start, end).map((project) => ({ id: project.id, title: project.title, createdAt: project.createdAt, updatedAt: project.updatedAt, nodeCount: project.nodes.length, connectionCount: project.connections.length })),
        hint: "用 site_navigate 跳转 /canvas/{id} 打开对应画布",
    };
}

function getImageConfig() {
    const { config } = useConfigStore.getState();
    const model = config.imageModel || config.model;
    return {
        current: { model, modelName: modelOptionName(model), quality: config.quality || "auto", size: config.size || "1:1", count: config.count || "1" },
        models: config.imageModels.map((value) => ({ value, label: modelOptionLabel(config, value) })),
        qualityOptions: ["auto", "high", "medium", "low"].map((value) => ({ value, label: value === "auto" ? "自动" : value === "high" ? "高" : value === "medium" ? "中" : "低" })),
        sizeOptions: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "2048x2048", "2048x1152", "1152x2048", "3840x2160", "2160x3840", "auto"].map((value) => ({ value, label: value })),
        countRange: { min: 1, max: 15 },
    };
}

function runImageWorkbench(input: SiteToolInput, navigate: Navigate) {
    const store = useConfigStore.getState();
    const applied: Record<string, unknown> = {};
    if (typeof input.model === "string" && input.model.trim()) {
        const value = normalizeModelOptionValue(input.model, store.config.channels) || input.model;
        store.updateConfig("imageModel", value);
        applied.model = value;
    }
    if (typeof input.quality === "string" && input.quality.trim()) {
        store.updateConfig("quality", input.quality);
        applied.quality = input.quality;
    }
    if (typeof input.size === "string" && input.size.trim()) {
        store.updateConfig("size", input.size);
        applied.size = input.size;
    }
    if (input.count != null) {
        const count = String(Math.max(1, Math.min(15, Math.floor(Number(input.count)) || 1)));
        store.updateConfig("count", count);
        applied.count = count;
    }
    const prompt = typeof input.prompt === "string" ? input.prompt : undefined;
    const run = input.run !== false;
    navigate("/image");
    const taskId = useWorkbenchAgentStore.getState().dispatchImage({ prompt, run });
    return { ok: true, navigated: "/image", prompt, run, taskId, applied, note: run ? "已跳转生图工作台并触发生成，可用 generation_get_status 查询任务" : "已跳转生图工作台并填入参数，未触发生成" };
}

function getVideoConfig() {
    const { config } = useConfigStore.getState();
    const model = config.videoModel || config.model;
    return {
        current: { model, modelName: modelOptionName(model), size: config.size || "1280x720", seconds: config.videoSeconds || "6", resolution: config.vquality || "720", generateAudio: config.videoGenerateAudio !== "false", watermark: config.videoWatermark === "true" },
        models: config.videoModels.map((value) => ({ value, label: modelOptionLabel(config, value) })),
        sizeOptions: ["1280x720", "720x1280", "1024x1024", "1792x1024", "1024x1792", "auto"],
        secondsOptions: ["6", "10", "12", "16", "20"],
        resolutionOptions: [{ value: "720", label: "720p" }, { value: "480", label: "480p" }],
    };
}

function runVideoWorkbench(input: SiteToolInput, navigate: Navigate) {
    const store = useConfigStore.getState();
    const applied: Record<string, unknown> = {};
    if (typeof input.model === "string" && input.model.trim()) {
        const value = normalizeModelOptionValue(input.model, store.config.channels) || input.model;
        store.updateConfig("videoModel", value);
        applied.model = value;
    }
    if (typeof input.size === "string" && input.size.trim()) {
        store.updateConfig("size", input.size);
        applied.size = input.size;
    }
    if (typeof input.seconds === "string" && input.seconds.trim()) {
        store.updateConfig("videoSeconds", input.seconds);
        applied.seconds = input.seconds;
    }
    if (typeof input.resolution === "string" && input.resolution.trim()) {
        store.updateConfig("vquality", input.resolution);
        applied.resolution = input.resolution;
    }
    if (typeof input.generateAudio === "boolean") {
        store.updateConfig("videoGenerateAudio", String(input.generateAudio));
        applied.generateAudio = input.generateAudio;
    }
    if (typeof input.watermark === "boolean") {
        store.updateConfig("videoWatermark", String(input.watermark));
        applied.watermark = input.watermark;
    }
    const prompt = typeof input.prompt === "string" ? input.prompt : undefined;
    const run = input.run !== false;
    navigate("/video");
    const taskId = useWorkbenchAgentStore.getState().dispatchVideo({ prompt, run });
    return { ok: true, navigated: "/video", prompt, run, taskId, applied, note: run ? "已跳转视频创作台并触发生成，可用 generation_get_status 查询任务" : "已跳转视频创作台并填入参数，未触发生成" };
}

async function searchPrompts(input: SiteToolInput) {
    const page = Math.max(1, Math.floor(Number(input.page)) || 1);
    const pageSize = Math.max(1, Math.min(50, Math.floor(Number(input.pageSize)) || 20));
    const tags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const result = await fetchPrompts({ keyword: String(input.keyword || ""), category: String(input.category || "全部"), tag: tags, page, pageSize });
    return { total: result.total, page, pageSize, categories: result.categories, tags: result.tags.slice(0, 60), items: result.items.map((item) => ({ id: item.id, title: item.title, prompt: item.prompt, category: item.category, tags: item.tags, coverUrl: item.coverUrl, githubUrl: item.githubUrl })) };
}

function listAssets(input: SiteToolInput) {
    const { assets, hydrated } = useAssetStore.getState();
    if (!hydrated) throw new Error("素材还在加载中，请稍后重试");
    const kind = input.kind === "text" || input.kind === "image" || input.kind === "video" ? input.kind : "all";
    const keyword = String(input.keyword || "").trim().toLowerCase();
    const filtered = assets.filter((asset) => {
        if (kind !== "all" && asset.kind !== kind) return false;
        return !keyword || [asset.title, asset.note, asset.source, ...asset.tags].filter(Boolean).join(" ").toLowerCase().includes(keyword);
    });
    const { page, pageSize, start, end } = paginate(input, filtered.length, 20);
    return { total: filtered.length, page, pageSize, items: filtered.slice(start, end).map((asset) => ({ id: asset.id, kind: asset.kind, title: asset.title, tags: asset.tags, source: asset.source, note: asset.note, createdAt: asset.createdAt, updatedAt: asset.updatedAt, coverUrl: asset.coverUrl || undefined, content: asset.kind === "text" ? asset.data.content : undefined })) };
}

async function addAsset(input: SiteToolInput) {
    const title = String(input.title || "").trim();
    if (!title) throw new Error("请提供素材标题 title");
    const tags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const source = typeof input.source === "string" ? input.source : "Agent";
    const note = typeof input.note === "string" ? input.note : undefined;
    const store = useAssetStore.getState();
    if (input.kind === "text") {
        const content = String(input.content || "").trim();
        if (!content) throw new Error("kind=text 时需要提供 content 文本内容");
        return { ok: true, id: store.addAsset({ kind: "text", title, coverUrl: "", tags, source, note, data: { content } }), kind: "text" };
    }
    if (input.kind === "image") {
        const imageUrl = String(input.imageUrl || "").trim();
        if (!imageUrl) throw new Error("kind=image 时需要提供 imageUrl（图片地址或 dataURL）");
        const image = await uploadImage(imageUrl).catch(() => null);
        if (!image) throw new Error("无法读取该图片地址，请改用 dataURL 或可跨域访问的图片链接");
        return { ok: true, id: store.addAsset({ kind: "image", title, coverUrl: image.url, tags, source, note, data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType } }), kind: "image" };
    }
    throw new Error("assets_add 仅支持 kind=text 或 kind=image");
}

function paginate(input: SiteToolInput, total: number, defaultSize: number) {
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize)) || defaultSize));
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(maxPage, Math.max(1, Math.floor(Number(input.page)) || 1));
    const start = (page - 1) * pageSize;
    return { page, pageSize, start, end: start + pageSize };
}
