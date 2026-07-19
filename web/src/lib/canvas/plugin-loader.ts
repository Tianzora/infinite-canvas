import { registerNodeDefinitions, unregisterPluginNodes } from "@/lib/canvas/node-registry";
import { getPluginRuntime } from "@/lib/canvas/plugin-runtime";
import { usePluginStore, type InstalledPlugin } from "@/stores/canvas/use-plugin-store";
import type { CanvasPlugin } from "@/types/canvas-plugin";

const cleanups = new Map<string, () => void>();

async function evaluatePluginSource(source: string): Promise<CanvasPlugin> {
    const blob = new Blob([source], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    try {
        const mod = (await import(/* webpackIgnore: true */ url)) as { default?: unknown; plugin?: unknown };
        const exported = mod.default ?? mod.plugin;
        const plugin = typeof exported === "function" ? (exported as (runtime: unknown) => unknown)(getPluginRuntime()) : exported;
        assertPlugin(plugin);
        return plugin;
    } finally {
        URL.revokeObjectURL(url);
    }
}

function assertPlugin(plugin: unknown): asserts plugin is CanvasPlugin {
    const value = plugin as Partial<CanvasPlugin> | null;
    if (!value || typeof value !== "object") throw new Error("插件未导出有效对象");
    if (!value.id || !Array.isArray(value.nodes) || !value.nodes.length) throw new Error("插件缺少 id 或 nodes");
}

export function activatePlugin(plugin: CanvasPlugin) {
    deactivatePlugin(plugin.id);
    registerNodeDefinitions(plugin.nodes, plugin.id);
    const runtime = getPluginRuntime();
    const disposers: Array<() => void> = [];
    if (plugin.css) disposers.push(runtime.injectCSS(plugin.css, plugin.id));
    const cleanup = plugin.setup?.(runtime);
    if (typeof cleanup === "function") disposers.push(cleanup);
    if (disposers.length) cleanups.set(plugin.id, () => disposers.forEach((dispose) => dispose()));
}

export function deactivatePlugin(pluginId: string) {
    cleanups.get(pluginId)?.();
    cleanups.delete(pluginId);
    unregisterPluginNodes(pluginId);
}

async function fetchPluginSource(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下载失败 (HTTP ${response.status})`);
    return response.text();
}

function withCacheBust(url: string) {
    return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

export async function installPluginFromUrl(url: string, opts?: { official?: boolean; bustCache?: boolean }) {
    const source = await fetchPluginSource(opts?.bustCache ? withCacheBust(url) : url);
    const plugin = await evaluatePluginSource(source);
    deactivatePlugin(plugin.id);
    usePluginStore.getState().upsert({
        id: plugin.id,
        name: plugin.name || plugin.id,
        version: plugin.version || "0.0.0",
        description: plugin.description,
        url,
        source,
        enabled: true,
        official: opts?.official,
    });
    activatePlugin(plugin);
    return plugin;
}

export async function updatePlugin(record: InstalledPlugin) {
    return installPluginFromUrl(record.url, { official: record.official, bustCache: true });
}

export async function setPluginEnabled(record: InstalledPlugin, enabled: boolean) {
    usePluginStore.getState().setEnabled(record.id, enabled);
    if (!enabled) {
        deactivatePlugin(record.id);
        return;
    }
    const source = record.local ? await fetchPluginSource(withCacheBust(record.url)) : record.source;
    activatePlugin(await evaluatePluginSource(source));
}

export function uninstallPlugin(id: string) {
    deactivatePlugin(id);
    usePluginStore.getState().remove(id);
}

let loaded = false;

export async function ensurePluginsLoaded() {
    if (loaded) return;
    loaded = true;
    await usePluginStore.persist.rehydrate();
    await loadLocalPlugins();
    const records = usePluginStore.getState().plugins.filter((record) => record.enabled);
    await Promise.all(
        records.map(async (record) => {
            try {
                const source = record.local ? await fetchPluginSource(withCacheBust(record.url)) : record.source;
                activatePlugin(await evaluatePluginSource(source));
            } catch (error) {
                console.error(`[plugin] 加载失败: ${record.id}`, error);
            }
        }),
    );
    await loadDevPlugins();
}

async function loadLocalPlugins() {
    let urls: unknown;
    try {
        const response = await fetch("/plugins/index.json");
        if (!response.ok) return;
        urls = await response.json();
    } catch {
        return;
    }
    if (!Array.isArray(urls) || !urls.length) return;
    const store = usePluginStore.getState();
    await Promise.all(
        urls.map(async (url: unknown) => {
            if (typeof url !== "string") return;
            try {
                const source = await fetchPluginSource(withCacheBust(url));
                const plugin = await evaluatePluginSource(source);
                const existing = store.plugins.find((item) => item.id === plugin.id);
                store.upsert({
                    id: plugin.id,
                    name: plugin.name || plugin.id,
                    version: plugin.version || "0.0.0",
                    description: plugin.description,
                    url,
                    source,
                    enabled: existing?.enabled ?? false,
                    local: true,
                    official: existing?.official,
                });
            } catch (error) {
                console.error(`[plugin] 本地插件发现失败: ${url}`, error);
            }
        }),
    );
}

async function loadDevPlugins() {
    const raw = process.env.NEXT_PUBLIC_DEV_PLUGINS;
    if (!raw) return;
    const urls = raw.split(",").map((item) => item.trim()).filter(Boolean);
    await Promise.all(
        urls.map(async (url) => {
            try {
                const source = await fetchPluginSource(withCacheBust(url));
                const plugin = await evaluatePluginSource(source);
                deactivatePlugin(plugin.id);
                activatePlugin(plugin);
                console.info(`[plugin] dev 插件已加载: ${plugin.id} (${url})`);
            } catch (error) {
                console.error(`[plugin] dev 插件加载失败: ${url}`, error);
            }
        }),
    );
}
