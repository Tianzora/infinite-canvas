import { expect, test } from "bun:test";

import { parsePromptTokens, serializePromptTokens } from "@/app/(user)/canvas/components/canvas-prompt-chip-input";

test("prompt chip tokens preserve ordinary text and node references", () => {
    const value = "a @[node:image-1] b @[node:text-2]";
    const tokens = parsePromptTokens(value);

    expect(tokens).toEqual([
        { type: "text", value: "a " },
        { type: "reference", nodeId: "image-1" },
        { type: "text", value: " b " },
        { type: "reference", nodeId: "text-2" },
    ]);
    expect(serializePromptTokens(tokens)).toBe(value);
});

test("ordinary @ text remains ordinary text", () => {
    const value = "email@example.com @style @[node:node-1]";
    expect(serializePromptTokens(parsePromptTokens(value))).toBe(value);
});
