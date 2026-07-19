"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ImageIcon, List, Music2, Settings2, Video, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type ConnectionHandle, type Position } from "../types";

export type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

type NodeCreateType = CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio;

export function ConnectionCreateMenu({ pending, onCreate, onClose }: { pending: PendingConnectionCreate; onCreate: (type: NodeCreateType) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div
            className="absolute z-[120] w-[300px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-connection-create-menu
            style={{ left: pending.position.x, top: pending.position.y, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    引用该节点生成
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label="关闭">
                    <X className="size-4" />
                </button>
            </div>
            <div className="grid gap-1">
                <ConnectionCreateOption theme={theme} icon={<List className="size-5" />} title="文本生成" description="脚本、广告词、品牌文案" onClick={() => onCreate(CanvasNodeType.Text)} />
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-5" />} title="图片生成" onClick={() => onCreate(CanvasNodeType.Image)} />
                <ConnectionCreateOption theme={theme} icon={<Video className="size-5" />} title="视频生成" onClick={() => onCreate(CanvasNodeType.Video)} />
                <ConnectionCreateOption theme={theme} icon={<Music2 className="size-5" />} title="音频参考" onClick={() => onCreate(CanvasNodeType.Audio)} />
                <ConnectionCreateOption theme={theme} icon={<Settings2 className="size-5" />} title="配置节点" description="模型、尺寸、数量和输入顺序" onClick={() => onCreate(CanvasNodeType.Config)} />
            </div>
        </div>
    );
}

export function NodeCreateMenu({ position, onCreate, onClose }: { position: Position; onCreate: (type: CanvasNodeType) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    useNodeRegistryVersion((state) => state.version);
    const pluginDefinitions = listNodeDefinitions().filter((definition) => definition.type && !Object.values(CanvasNodeType).includes(definition.type as CanvasNodeType) && definition.showInCreateMenu !== false);
    const menuRef = useRef<HTMLDivElement>(null);
    const [renderPosition, setRenderPosition] = useState(position);

    useLayoutEffect(() => {
        const menu = menuRef.current;
        const container = menu?.parentElement;
        if (!menu || !container) return;

        const padding = 12;
        const clamp = (value: number, max: number) => Math.min(Math.max(value, padding), Math.max(padding, max));
        setRenderPosition({
            x: clamp(position.x, container.clientWidth - menu.offsetWidth - padding),
            y: clamp(position.y, container.clientHeight - menu.offsetHeight - padding),
        });
    }, [position.x, position.y]);

    return (
        <div
            ref={menuRef}
            className="absolute z-[120] w-[300px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-canvas-no-zoom
            style={{ left: renderPosition.x, top: renderPosition.y, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text, maxHeight: "calc(100% - 24px)", overflowY: "auto" }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    选择节点
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg opacity-55 transition hover:opacity-100" onClick={onClose} aria-label="关闭">
                    <X className="size-4" />
                </button>
            </div>
            <div className="grid gap-1">
                <ConnectionCreateOption theme={theme} icon={<List className="size-5" />} title="文本" onClick={() => onCreate(CanvasNodeType.Text)} />
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-5" />} title="图片" onClick={() => onCreate(CanvasNodeType.Image)} />
                <ConnectionCreateOption theme={theme} icon={<Video className="size-5" />} title="视频" onClick={() => onCreate(CanvasNodeType.Video)} />
                <ConnectionCreateOption theme={theme} icon={<Music2 className="size-5" />} title="音频" onClick={() => onCreate(CanvasNodeType.Audio)} />
                <ConnectionCreateOption theme={theme} icon={<Settings2 className="size-5" />} title="生成配置" onClick={() => onCreate(CanvasNodeType.Config)} />
                {pluginDefinitions.map((definition) => <ConnectionCreateOption key={definition.type} theme={theme} icon={definition.icon} title={definition.title} description={definition.description} onClick={() => onCreate(definition.type as CanvasNodeType)} />)}
            </div>
        </div>
    );
}

export function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: ReactNode; title: string; description?: string; onClick?: () => void }) {
    return (
        <button type="button" className="flex h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition" style={{ color: theme.node.text }} onClick={onClick} onMouseEnter={(event) => (event.currentTarget.style.background = theme.node.fill)} onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: theme.node.fill, color: theme.node.muted }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-base font-semibold leading-5">{title}</span>
                {description ? <span className="mt-1 block truncate text-sm" style={{ color: theme.node.muted }}>{description}</span> : null}
            </span>
        </button>
    );
}
