import { expect, test } from "bun:test";

import { getNodeSpecForType, registerNodeDefinitions, unregisterPluginNodes } from "../src/lib/canvas/node-registry";

test("custom plugin nodes use registry creation metadata", () => {
    registerNodeDefinitions(
        [{ type: "test:custom", title: "测试节点", icon: "T", defaultSize: { width: 420, height: 280 }, showInCreateMenu: true }],
        "test-plugin",
    );

    expect(getNodeSpecForType("test:custom")).toEqual({ width: 420, height: 280, title: "测试节点", metadata: undefined });
    unregisterPluginNodes("test-plugin");
});
