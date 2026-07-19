import { create } from "zustand";

import { getNodeSpec as getBuiltinNodeSpec } from "@/app/(user)/canvas/constants";
import { CanvasNodeType } from "@/app/(user)/canvas/types";
import type { CanvasNodeDefinition } from "@/types/canvas-plugin";

const definitions = new Map<string, CanvasNodeDefinition>();
const ownerByType = new Map<string, string>();

export const useNodeRegistryVersion = create<{ version: number }>(() => ({ version: 0 }));

function bump() {
    useNodeRegistryVersion.setState((state) => ({ version: state.version + 1 }));
}

const builtinIcons: Record<CanvasNodeType, string> = {
    [CanvasNodeType.Image]: "🖼",
    [CanvasNodeType.Text]: "T",
    [CanvasNodeType.Config]: "⚙",
    [CanvasNodeType.Video]: "▶",
    [CanvasNodeType.Audio]: "♫",
};

for (const type of Object.values(CanvasNodeType)) {
    const spec = getBuiltinNodeSpec(type);
    definitions.set(type, {
        type,
        title: spec.title,
        icon: builtinIcons[type],
        defaultSize: { width: spec.width, height: spec.height },
        defaultMetadata: spec.metadata,
        showInCreateMenu: true,
        hasSourceHandle: type !== CanvasNodeType.Config,
    });
    ownerByType.set(type, "builtin");
}

export function registerNodeDefinitions(defs: CanvasNodeDefinition[], pluginId = "builtin") {
    defs.forEach((definition) => {
        definitions.set(definition.type, definition);
        ownerByType.set(definition.type, pluginId);
    });
    bump();
}

export function unregisterPluginNodes(pluginId: string) {
    for (const [type, owner] of ownerByType) {
        if (owner !== pluginId) continue;
        definitions.delete(type);
        ownerByType.delete(type);
    }
    bump();
}

export function getNodeDefinition(type: string) {
    return definitions.get(type);
}

export function getNodePluginId(type: string) {
    return ownerByType.get(type) || "builtin";
}

export function listNodeDefinitions() {
    return Array.from(definitions.values());
}

export function isRegisteredNodeType(type: string) {
    return definitions.has(type);
}

const FALLBACK_SPEC = { width: 340, height: 240, title: "节点", metadata: {} };

export function getNodeSpecForType(type: string) {
    const definition = definitions.get(type);
    if (!definition) return FALLBACK_SPEC;
    return {
        width: definition.defaultSize.width,
        height: definition.defaultSize.height,
        title: definition.title,
        metadata: definition.defaultMetadata,
    };
}

export const getNodeSpec = getNodeSpecForType;

export function isBuiltinNodeType(type: string) {
    return (Object.values(CanvasNodeType) as string[]).includes(type);
}
