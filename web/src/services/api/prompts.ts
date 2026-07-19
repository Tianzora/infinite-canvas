import localforage from "localforage";

import { runPromptSource, type RawPrompt } from "./prompt-source-runtime";
import { usePromptSourceStore } from "@/stores/use-prompt-source-store";
import type { PromptSource } from "./prompt-source-presets";
import { apiGet, compactApiParams } from "@/services/api/request";

export type Prompt = RawPrompt & {
    category: string;
    githubUrl: string;
};

export const ALL_PROMPTS_OPTION = "全部";

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    total: number;
};

const cacheTtlMs = 1000 * 60 * 60;
const promptCacheStore = localforage.createInstance({ name: "infinite-canvas", storeName: "prompt_cache" });
const loadingSources = new Map<string, Promise<Prompt[]>>();
const backendPageSize = 500;

type SourceCache = { items: Prompt[]; fetchedAt: number; signature: string };

function enabledSources() {
    return usePromptSourceStore.getState().sources.filter((source) => source.enabled);
}

function sourceSignature(source: PromptSource) {
    const value = `${source.name}\n${source.githubUrl}\n${source.script}`;
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
    return `${value.length}:${hash}`;
}

function withSourceMeta(source: PromptSource, items: RawPrompt[]): Prompt[] {
    return items.map((item) => ({ ...item, category: source.name, githubUrl: source.githubUrl }));
}

function sourceCacheKey(sourceId: string) {
    return `prompt-source:${sourceId}`;
}

async function runSource(source: PromptSource): Promise<Prompt[]> {
    const prompts = withSourceMeta(source, await runPromptSource(source.script));
    await promptCacheStore.setItem<SourceCache>(sourceCacheKey(source.id), { items: prompts, fetchedAt: Date.now(), signature: sourceSignature(source) });
    return prompts;
}

async function getSourcePrompts(source: PromptSource, force = false): Promise<Prompt[]> {
    const signature = sourceSignature(source);
    const cached = await promptCacheStore.getItem<SourceCache>(sourceCacheKey(source.id));
    if (!force) {
        if (cached?.items?.length && cached.signature === signature && Date.now() - cached.fetchedAt < cacheTtlMs) return cached.items;
    }
    if (!force && loadingSources.has(source.id)) return loadingSources.get(source.id)!;
    const loading = runSource(source).finally(() => loadingSources.delete(source.id));
    loadingSources.set(source.id, loading);
    try {
        return await loading;
    } catch (error) {
        if (!force && cached?.items?.length && cached.signature === signature) return cached.items;
        throw error;
    }
}

async function getAllPrompts() {
    const settled = await Promise.all(
        enabledSources().map(async (source) => {
            try {
                return await getSourcePrompts(source, false);
            } catch {
                return [];
            }
        }),
    );
    return settled.flat();
}

function mergePrompts(backend: Prompt[], local: Prompt[]) {
    const seen = new Set<string>();
    return [...backend, ...local].filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
    });
}

export async function fetchPrompts({ keyword = "", tag = [], category = ALL_PROMPTS_OPTION, page = 1, pageSize = 20 }: { keyword?: string; tag?: string[]; category?: string; page?: number; pageSize?: number } = {}) {
    const [backendResult, localResult] = await Promise.allSettled([
        apiGet<PromptListResponse>(
            "/api/prompts",
            compactApiParams({ keyword, tag, category: category !== ALL_PROMPTS_OPTION ? category : undefined, page: 1, pageSize: backendPageSize }),
        ),
        getAllPrompts(),
    ]);
    const backend = backendResult.status === "fulfilled" ? backendResult.value : { items: [], tags: [], categories: [], total: 0 };
    const local = localResult.status === "fulfilled" ? localResult.value : [];
    const items = mergePrompts(backend.items || [], local);
    const normalizedKeyword = keyword.trim().toLowerCase();
    const normalizedPage = Math.max(1, page);
    const normalizedPageSize = Math.max(1, Math.min(100, pageSize));
    const withoutTagFilter = filterPrompts(items, { keyword: normalizedKeyword, category, tags: [] });
    const filtered = filterPrompts(items, { keyword: normalizedKeyword, category, tags: tag });
    return {
        items: filtered.slice((normalizedPage - 1) * normalizedPageSize, normalizedPage * normalizedPageSize),
        tags: collectTags(withoutTagFilter),
        categories: Array.from(new Set([...(backend.categories || []), ...enabledSources().map((source) => source.name)])),
        total: filtered.length,
    };
}

export async function fetchSourcePrompts(sourceId: string, force = false): Promise<Prompt[]> {
    const source = usePromptSourceStore.getState().sources.find((item) => item.id === sourceId);
    if (!source) throw new Error("提示词来源不存在");
    return getSourcePrompts(source, force);
}

export async function refreshSource(sourceId: string): Promise<number> {
    return (await fetchSourcePrompts(sourceId, true)).length;
}

export async function refreshAllSources(): Promise<number> {
    return (await refreshAllSourcesDetailed()).count;
}

export async function refreshAllSourcesDetailed(): Promise<{ count: number; failed: string[] }> {
    const settled = await Promise.all(
        enabledSources().map(async (source) => {
            try {
                return { name: source.name, items: await getSourcePrompts(source, true), error: false };
            } catch {
                return { name: source.name, items: [], error: true };
            }
        }),
    );
    return {
        count: settled.reduce((total, result) => total + result.items.length, 0),
        failed: settled.filter((result) => result.error).map((result) => result.name),
    };
}

function filterPrompts(items: Prompt[], options: { keyword: string; category: string; tags: string[] }) {
    return items.filter((item) => {
        if (isActiveOption(options.category) && item.category !== options.category) return false;
        if (options.tags.length && !options.tags.some((tag) => item.tags.includes(tag))) return false;
        if (!options.keyword) return true;
        return [item.title, item.prompt, item.category, ...item.tags].join(" ").toLowerCase().includes(options.keyword);
    });
}

function collectTags(items: Prompt[]) {
    return Array.from(new Set(items.flatMap((item) => item.tags).filter(Boolean)));
}

function isActiveOption(value: string) {
    return value && value !== "全部" && value !== "all";
}

export function formatPromptDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
