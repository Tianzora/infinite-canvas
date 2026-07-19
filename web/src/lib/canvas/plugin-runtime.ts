import React from "react";

import { emitCanvasEvent, onCanvasEvent } from "@/lib/canvas/canvas-event-bus";
import { APP_VERSION } from "@/constant/env";
import type { PluginRuntime } from "@/types/canvas-plugin";

let runtime: PluginRuntime | null = null;

function injectCSS(css: string, key?: string) {
    const id = key ? `canvas-plugin-style-${key}` : undefined;
    if (id) document.getElementById(id)?.remove();
    const style = document.createElement("style");
    if (id) style.id = id;
    style.dataset.canvasPluginStyle = "true";
    style.textContent = css;
    document.head.appendChild(style);
    return () => style.remove();
}

export function getPluginRuntime(): PluginRuntime {
    if (!runtime) {
        runtime = {
            React,
            jsx: React.createElement,
            Fragment: React.Fragment,
            injectCSS,
            version: APP_VERSION,
            emit: emitCanvasEvent,
            on: onCanvasEvent,
        };
        (globalThis as unknown as { InfiniteCanvasRuntime?: PluginRuntime }).InfiniteCanvasRuntime = runtime;
    }
    return runtime;
}
