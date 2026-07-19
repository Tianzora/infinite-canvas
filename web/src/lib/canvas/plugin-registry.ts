import { PLUGIN_REGISTRY_URL } from "@/constant/env";

export type OfficialPluginEntry = {
    id: string;
    name: string;
    version: string;
    description?: string;
    icon?: string;
    url: string;
};

type RawEntry = { id?: string; name?: string; version?: string; description?: string; icon?: string; entry?: string; url?: string };
type RawManifest = { plugins?: RawEntry[] };

export async function fetchOfficialPlugins(registryUrl: string = PLUGIN_REGISTRY_URL): Promise<OfficialPluginEntry[]> {
    const response = await fetch(registryUrl, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`获取官方插件列表失败 (HTTP ${response.status})`);
    const data = (await response.json()) as RawManifest | RawEntry[];
    const list = Array.isArray(data) ? data : Array.isArray(data?.plugins) ? data.plugins : [];
    return list
        .filter((item): item is RawEntry & { id: string } => Boolean(item && item.id && (item.entry || item.url)))
        .map((item) => ({
            id: item.id,
            name: item.name || item.id,
            version: item.version || "0.0.0",
            description: item.description,
            icon: item.icon,
            url: item.url || new URL(item.entry as string, registryUrl).toString(),
        }));
}

function compareSemver(a: string, b: string) {
    const parse = (version: string) => version.split(".").map((part) => Number.parseInt(part, 10) || 0);
    const [pa, pb] = [parse(a), parse(b)];
    for (let index = 0; index < 3; index += 1) {
        const difference = (pa[index] || 0) - (pb[index] || 0);
        if (difference) return difference;
    }
    return 0;
}

export function hasUpgrade(installedVersion: string, remoteVersion: string) {
    return compareSemver(remoteVersion, installedVersion) > 0;
}
