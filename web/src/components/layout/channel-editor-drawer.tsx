import { Button, Drawer, Input, Space } from "antd";
import { ListPlus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { guessCapability, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
import { ModelScriptEditor } from "./model-script-editor";
import { ModelSelectModal } from "./model-select-modal";

const capabilityLabels: Record<ModelCapability, string> = { image: "生图", video: "视频", text: "文本", audio: "音频" };
type ScriptTarget = { name: string; capability: ModelCapability; value: string };

export function ChannelEditorDrawer({ open, channel, onSave, onClose }: { open: boolean; channel: ModelChannel | null; onSave: (channel: ModelChannel) => void; onClose: () => void }) {
    const [draft, setDraft] = useState<ModelChannel | null>(channel);
    const [selectOpen, setSelectOpen] = useState(false);
    const [scriptTarget, setScriptTarget] = useState<ScriptTarget | null>(null);

    useEffect(() => {
        if (open && channel) setDraft(channel);
    }, [open, channel]);

    if (!draft) return null;

    const patch = (value: Partial<ModelChannel>) => setDraft((current) => current ? { ...current, ...value } : current);
    const setScript = (name: string, script: string) => {
        const modelScripts = { ...(draft.modelScripts || {}) };
        if (script) modelScripts[name] = script;
        else delete modelScripts[name];
        patch({ modelScripts });
    };
    const save = () => {
        const models = Array.from(new Set(draft.models.map((model) => model.trim()).filter(Boolean)));
        const modelSet = new Set(models);
        const modelScripts = Object.fromEntries(Object.entries(draft.modelScripts || {}).filter(([model, script]) => modelSet.has(model) && script.trim()));
        onSave({ ...draft, name: draft.name.trim() || "未命名渠道", models, modelScripts });
        onClose();
    };

    return (
        <Drawer open={open} width={640} title="编辑渠道" onClose={onClose} styles={{ body: { paddingTop: 16 } }} extra={<Space><Button onClick={onClose}>取消</Button><Button type="primary" onClick={save}>保存</Button></Space>}>
            <div className="grid gap-4 md:grid-cols-2">
                <label className="block md:col-span-2"><span className="mb-1 block text-sm font-medium">渠道名称</span><Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></label>
                <label className="block md:col-span-2"><span className="mb-1 block text-sm font-medium">接口地址</span><Input value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com" /></label>
                <label className="block md:col-span-2"><span className="mb-1 block text-sm font-medium">API Key</span><Input.Password value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder="sk-..." /></label>
            </div>
            <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-semibold">渠道模型</div><div className="mt-0.5 text-xs text-stone-500">已选 {draft.models.length} 个；可为模型配置独立调用脚本。</div></div><Button type="primary" icon={<ListPlus className="size-4" />} onClick={() => setSelectOpen(true)}>选择模型</Button></div>
            <div className="space-y-2 rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                {draft.models.length ? draft.models.map((model) => { const capability = guessCapability(model); const script = draft.modelScripts?.[model] || ""; return <div key={model} className="flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-900/40"><span className="min-w-0 flex-1 truncate text-sm" title={model}>{model}</span><span className="shrink-0 text-xs text-stone-500">{capabilityLabels[capability]}</span><div className="flex shrink-0 items-center gap-2"><Button size="small" type={script ? "primary" : "default"} ghost={Boolean(script)} onClick={() => setScriptTarget({ name: model, capability, value: script })}>{script ? "脚本已设" : "调用脚本"}</Button><Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} onClick={() => patch({ models: draft.models.filter((item) => item !== model) })} /></div></div>; }) : <div className="px-2 py-8 text-center text-sm text-stone-500">点击「选择模型」拉取或手动增加模型。</div>}
            </div>
            <ModelSelectModal open={selectOpen} channel={draft} selectedNames={draft.models} onConfirm={(models) => patch({ models })} onClose={() => setSelectOpen(false)} />
            <ModelScriptEditor open={Boolean(scriptTarget)} capability={scriptTarget?.capability || "text"} modelName={scriptTarget?.name || ""} value={scriptTarget?.value || ""} onSave={(script) => scriptTarget && setScript(scriptTarget.name, script)} onClose={() => setScriptTarget(null)} />
        </Drawer>
    );
}
