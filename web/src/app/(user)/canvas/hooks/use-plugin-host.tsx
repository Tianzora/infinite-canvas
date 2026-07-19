import { useCallback, useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { requestEdit, requestGeneration, requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import { requestVideoGeneration, storeGeneratedVideo } from "@/services/api/video";
import { decodeChannelModel, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { buildGenerationConfig } from "@/lib/canvas/canvas-generation-helpers";
import { buildNodeContext } from "@/lib/canvas/plugin-node-context";
import { ensurePluginsLoaded } from "@/lib/canvas/plugin-loader";
import { getNodeDefinition, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { canvasThemes } from "@/lib/canvas-theme";
import type { CanvasAgentOp } from "../utils/canvas-agent-ops";
import type { CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";
import type { CanvasNodeToolbarItem, CanvasPluginAi, CanvasPluginHost } from "@/types/canvas-plugin";
import type { ReferenceImage } from "@/types/image";

type CanvasTheme = (typeof canvasThemes)[keyof typeof canvasThemes];

export type PluginHostParams = {
    effectiveConfig: AiConfig;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    theme: CanvasTheme;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    viewportRef: MutableRefObject<ViewportTransform>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    applyAgentOps: (ops?: CanvasAgentOp[]) => unknown;
};

export function usePluginHost(params: PluginHostParams) {
    const { effectiveConfig, isAiConfigReady, openConfigDialog, theme, nodesRef, connectionsRef, viewportRef, setNodes, setDialogNodeId, applyAgentOps } = params;
    const registryVersion = useNodeRegistryVersion((state) => state.version);

    const pluginAi = useMemo<CanvasPluginAi>(() => {
        const toReferences = (refs?: string[]): ReferenceImage[] =>
            (refs || []).filter(Boolean).map((dataUrl, index) => ({ id: `plugin-ref-${index}`, name: `ref-${index}.png`, type: "image/png", dataUrl }));
        const ensureReady = (config: AiConfig) => {
            if (!isAiConfigReady(config, config.model)) {
                openConfigDialog(true);
                throw new Error("AI 配置未就绪,请先在设置里配置模型与密钥");
            }
        };

        return {
            generateImage: async (prompt, options) => {
                const config = {
                    ...buildGenerationConfig(effectiveConfig, undefined, "image"),
                    count: String(options?.count || 1),
                    ...(options?.model ? { model: options.model } : {}),
                    ...(options?.size ? { size: options.size } : {}),
                };
                ensureReady(config);
                const references = toReferences(options?.references);
                const items = references.length ? await requestEdit(config, prompt, references, undefined, { signal: options?.signal }) : await requestGeneration(config, prompt, { signal: options?.signal });
                return { images: items.map((item) => item.dataUrl) };
            },
            generateVideo: async (prompt, options) => {
                const config = {
                    ...buildGenerationConfig(effectiveConfig, undefined, "video"),
                    ...(options?.model ? { model: options.model } : {}),
                    ...(options?.size ? { size: options.size } : {}),
                    ...(options?.seconds ? { videoSeconds: options.seconds } : {}),
                };
                ensureReady(config);
                const file = await storeGeneratedVideo(await requestVideoGeneration(config, prompt, toReferences(options?.references), [], [], { signal: options?.signal }));
                return { url: file.url, mimeType: file.mimeType, width: file.width, height: file.height, durationMs: file.durationMs };
            },
            generateText: async (prompt, options) => {
                const config = { ...buildGenerationConfig(effectiveConfig, undefined, "text"), ...(options?.model ? { model: options.model } : {}) };
                ensureReady(config);
                const messages: AiTextMessage[] = [...(options?.system ? [{ role: "system" as const, content: options.system }] : []), { role: "user" as const, content: prompt }];
                const text = await requestImageQuestion(config, messages, (delta) => options?.onDelta?.(delta), { signal: options?.signal });
                return { text };
            },
            listModels: (capability) =>
                selectableModelsByCapability(effectiveConfig, capability as ModelCapability | undefined).map((value) => ({ value, label: decodeChannelModel(value)?.model || value })),
            defaultModel: (capability) => buildGenerationConfig(effectiveConfig, undefined, capability).model,
        };
    }, [effectiveConfig, isAiConfigReady, openConfigDialog]);

    const pluginHost = useMemo<CanvasPluginHost>(
        () => ({
            getNode: (id) => nodesRef.current.find((node) => node.id === id) || null,
            getNodes: () => nodesRef.current,
            getConnections: () => connectionsRef.current,
            getUpstream: (nodeId) =>
                connectionsRef.current
                    .filter((connection) => connection.toNodeId === nodeId)
                    .map((connection) => nodesRef.current.find((node) => node.id === connection.fromNodeId))
                    .filter((node): node is CanvasNodeData => Boolean(node)),
            getDownstream: (nodeId) =>
                connectionsRef.current
                    .filter((connection) => connection.fromNodeId === nodeId)
                    .map((connection) => nodesRef.current.find((node) => node.id === connection.toNodeId))
                    .filter((node): node is CanvasNodeData => Boolean(node)),
            updateNode: (nodeId, patch) => setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))),
            updateMetadata: (nodeId, patch) => setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...patch } } : node))),
            applyOps: (ops) => {
                void applyAgentOps(ops);
            },
            ai: pluginAi,
            openPanel: (nodeId) => setDialogNodeId(nodeId),
            closePanel: () => setDialogNodeId(null),
        }),
        [applyAgentOps, pluginAi, setDialogNodeId, setNodes],
    );

    const getPluginDefinition = useCallback((node: CanvasNodeData) => getNodeDefinition(node.type), []);

    const renderPluginContent = useCallback(
        (node: CanvasNodeData, isSelected = false) => {
            const Content = getNodeDefinition(node.type)?.Content;
            if (!Content) return null;
            const ctx = buildNodeContext(pluginHost, node, theme, viewportRef.current.k, isSelected);
            return <Content ctx={ctx} />;
        },
        [pluginHost, theme, viewportRef],
    );

    const renderPluginPanel = useCallback(
        (panelNode: CanvasNodeData) => {
            const Panel = getNodeDefinition(panelNode.type)?.Panel;
            if (!Panel) return null;
            const ctx = buildNodeContext(pluginHost, panelNode, theme, viewportRef.current.k, true);
            return <Panel ctx={ctx} onClose={() => setDialogNodeId(null)} />;
        },
        [pluginHost, setDialogNodeId, theme, viewportRef],
    );

    const buildNodeToolbarItems = useCallback(
        (node: CanvasNodeData): CanvasNodeToolbarItem[] => {
            const definition = getNodeDefinition(node.type);
            if (!definition) return [];
            const ctx = buildNodeContext(pluginHost, node, theme, viewportRef.current.k, false);
            const custom = definition.toolbar?.(ctx) || [];
            if (!definition.interactionToggle || !node.metadata?.content || definition.forceInteractive?.(node)) return custom;
            const interactive = Boolean(node.metadata?.interactive);
            return [
                {
                    id: "node-interaction-toggle",
                    title: interactive ? "当前:交互中。点击切回移动" : "当前:可移动。点击切到交互",
                    label: interactive ? "移动" : "交互",
                    icon: interactive ? "✋" : "🖐",
                    active: interactive,
                    onClick: () => pluginHost.updateMetadata(node.id, { interactive: !interactive }),
                },
                ...custom,
            ];
        },
        [pluginHost, theme, viewportRef],
    );

    const handlePluginDoubleClick = useCallback(
        (node: CanvasNodeData) => {
            const handler = getNodeDefinition(node.type)?.onDoubleClick;
            if (!handler) return false;
            const ctx = buildNodeContext(pluginHost, node, theme, viewportRef.current.k, true);
            return handler(ctx) === true;
        },
        [pluginHost, theme, viewportRef],
    );

    useEffect(() => {
        void ensurePluginsLoaded();
    }, []);

    return {
        pluginHost,
        registryVersion,
        getPluginDefinition,
        renderPluginContent,
        renderPluginPanel,
        buildNodeToolbarItems,
        handlePluginDoubleClick,
    };
}
