import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import assert from "node:assert/strict";
import test from "node:test";

import { CanvasSession } from "./canvas-session.js";

test("MCP reads and writes only the active canvas", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => { first.close(); second.close(); });

    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.activateClient("second");
    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-second");

    const result = session.callTool("canvas_create_text_node", { text: "second only" });
    const call = second.event("tool_call");
    assert.equal(first.event("tool_call"), undefined);
    session.resolveResult("second", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });
});

test("tool results are accepted only from the request client", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => { first.close(); second.close(); });
    session.activateClient("first");

    const result = session.callTool("canvas_create_text_node", { text: "first only" });
    const requestId = String(field(first.event("tool_call"), "requestId"));
    assert.equal(session.resolveResult("second", { requestId, result: { client: "second" } }), false);
    assert.equal(session.resolveResult("first", { requestId, result: { client: "first" } }), true);
    assert.deepEqual(await result, { client: "first" });
});

test("generation status is routed to the active canvas", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => { first.close(); second.close(); });
    session.activateClient("second");

    const result = session.callTool("generation_get_status", { scope: "all" });
    const call = second.event("tool_call");
    assert.equal(first.event("tool_call"), undefined);
    session.resolveResult("second", { requestId: String(field(call, "requestId")), result: { total: 1 } });
    assert.deepEqual(await result, { total: 1 });
});

test("closing the active client falls back to another connected client", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => { first.close(); second.close(); });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.activateClient("second");
    second.close();
    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-first");
});

test("Codex state is shared with newly connected clients", (t) => {
    const session = new CanvasSession();
    session.setCodexState({ busy: true, threadId: "thread-1", turnId: "turn-1" });
    const client = connect(session, "first");
    t.after(() => client.close());
    assert.deepEqual(field(client.event("hello"), "codex"), { busy: true, threadId: "thread-1", turnId: "turn-1" });
    session.setCodexState({ busy: false });
    assert.deepEqual(client.event("codex_state"), { busy: false, threadId: "thread-1", turnId: "turn-1" });
});

test("a bound client remains the tool target while focus changes", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => { first.close(); second.close(); });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.bindClient("first");
    session.activateClient("second");
    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-first");
    session.releaseClient("first");
    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-second");
});

function connect(session: CanvasSession, clientId: string) {
    const response = new FakeSseResponse();
    session.openEvents(new URL(`http://127.0.0.1/events?clientId=${clientId}`), response as unknown as ServerResponse);
    return response;
}

function snapshot(projectId: string) {
    return { projectId, title: projectId, nodes: [], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
}

function field(value: unknown, key: string) {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

class FakeSseResponse extends EventEmitter {
    private chunks: string[] = [];

    writeHead() {
        return this;
    }

    write(chunk: string) {
        this.chunks.push(chunk);
        return true;
    }

    event(type: string) {
        const chunk = this.chunks.find((item) => item.startsWith(`event: ${type}\n`));
        const data = chunk?.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
        return data ? (JSON.parse(data) as unknown) : undefined;
    }

    close() {
        this.emit("close");
    }
}
