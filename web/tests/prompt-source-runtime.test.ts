import { expect, test } from "bun:test";

import { runPromptSource } from "../src/services/api/prompt-source-runtime";

test("runs a remote script and normalizes prompt items", async () => {
    const originalFetch = globalThis.fetch;
    const requests: RequestInit[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(init || {});
        return new Response("![cover](./images/cover.png)");
    }) as typeof fetch;

    try {
        const items = await runPromptSource(`
const markdown = await fetchText("https://example.com/README.md");
const images = extractImages("https://example.com", markdown);
return [
  makePrompt({ id: "first", title: "  First  ", prompt: "  prompt text  ", coverUrl: images[0], tags: tagsFromHeading("Portrait / Editorial") }),
  { id: "first", title: "duplicate", prompt: "ignored" },
  { title: "", prompt: "ignored" },
  { title: "Second", prompt: " second prompt " }
];
`);

        expect(requests).toEqual([{ cache: "no-store" }]);
        expect(items).toEqual([
            {
                id: "first",
                title: "First",
                coverUrl: "https://example.com/images/cover.png",
                prompt: "prompt text",
                tags: ["portrait", "editorial"],
                preview: "",
                createdAt: "",
                updatedAt: "",
            },
            {
                id: "prompt-0002",
                title: "Second",
                coverUrl: "",
                prompt: "second prompt",
                tags: [],
                preview: "",
                createdAt: "",
                updatedAt: "",
            },
        ]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("reports invalid prompt-source script results", async () => {
    await expect(runPromptSource("return { title: 'not an array' };"))
        .rejects.toThrow("提示词来源脚本需要 return 一个数组");
    await expect(runPromptSource("throw new Error('fixture failed');"))
        .rejects.toThrow("提示词来源脚本执行失败：fixture failed");
});
