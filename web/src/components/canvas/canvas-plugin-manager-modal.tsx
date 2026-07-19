"use client";

import { App, Alert, Button, Input, Modal, Popconfirm, Space, Switch, Tag } from "antd";
import { Download, Puzzle, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { fetchOfficialPlugins, hasUpgrade, type OfficialPluginEntry } from "@/lib/canvas/plugin-registry";
import { installPluginFromUrl, setPluginEnabled, uninstallPlugin, updatePlugin } from "@/lib/canvas/plugin-loader";
import { usePluginStore, type InstalledPlugin } from "@/stores/canvas/use-plugin-store";

export function CanvasPluginManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const plugins = usePluginStore((state) => state.plugins);
    const [official, setOfficial] = useState<OfficialPluginEntry[]>([]);
    const [loadingOfficial, setLoadingOfficial] = useState(false);
    const [registryError, setRegistryError] = useState("");
    const [customUrl, setCustomUrl] = useState("");
    const [busyId, setBusyId] = useState("");

    const loadOfficial = useCallback(async () => {
        setLoadingOfficial(true);
        setRegistryError("");
        try {
            setOfficial(await fetchOfficialPlugins());
        } catch (error) {
            setRegistryError(error instanceof Error ? error.message : "获取官方插件列表失败");
        } finally {
            setLoadingOfficial(false);
        }
    }, []);

    useEffect(() => {
        if (open) void loadOfficial();
    }, [loadOfficial, open]);

    const installed = (id: string) => plugins.find((plugin) => plugin.id === id);

    const installOfficial = async (entry: OfficialPluginEntry) => {
        setBusyId(entry.id);
        try {
            await installPluginFromUrl(entry.url, { official: true });
            message.success(`已安装「${entry.name}」`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "安装插件失败");
        } finally {
            setBusyId("");
        }
    };

    const installCustom = async () => {
        const url = customUrl.trim();
        if (!url) {
            message.warning("请输入插件 JS 地址");
            return;
        }
        setBusyId("custom");
        try {
            await installPluginFromUrl(url);
            setCustomUrl("");
            message.success("插件已安装");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "安装插件失败");
        } finally {
            setBusyId("");
        }
    };

    const update = async (plugin: InstalledPlugin) => {
        setBusyId(plugin.id);
        try {
            await updatePlugin(plugin);
            message.success(`「${plugin.name}」已更新`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新插件失败");
        } finally {
            setBusyId("");
        }
    };

    const toggle = async (plugin: InstalledPlugin, enabled: boolean) => {
        setBusyId(plugin.id);
        try {
            await setPluginEnabled(plugin, enabled);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "切换插件失败");
        } finally {
            setBusyId("");
        }
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} width={760} title="节点插件">
            <div className="space-y-5">
                <section>
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 text-sm font-semibold">
                                <Puzzle className="size-4" />
                                官方插件
                            </div>
                            <div className="mt-1 text-xs text-stone-500">从官方注册表安装画布节点。</div>
                        </div>
                        <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loadingOfficial} onClick={() => void loadOfficial()}>
                            刷新
                        </Button>
                    </div>
                    {registryError ? <Alert className="mb-2" type="warning" showIcon message={registryError} /> : null}
                    <div className="space-y-2">
                        {official.map((entry) => {
                            const current = installed(entry.id);
                            const upgrade = current ? hasUpgrade(current.version, entry.version) : false;
                            return (
                                <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2.5 dark:border-stone-800">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-stone-100 text-base dark:bg-stone-800">{entry.icon || <Puzzle className="size-4" />}</span>
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-medium">{entry.name}</div>
                                            <div className="mt-0.5 truncate text-xs text-stone-500">v{entry.version}{entry.description ? ` · ${entry.description}` : ""}</div>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {current ? <Tag color={current.enabled ? "green" : "default"}>{current.enabled ? "已启用" : "已停用"}</Tag> : null}
                                        {upgrade ? <Button size="small" icon={<Download className="size-3.5" />} loading={busyId === entry.id} onClick={() => void update(current!)}>更新</Button> : <Button size="small" type={current ? "default" : "primary"} loading={busyId === entry.id} onClick={() => (current ? undefined : void installOfficial(entry))}>{current ? "已安装" : "安装"}</Button>}
                                    </div>
                                </div>
                            );
                        })}
                        {!loadingOfficial && !official.length && !registryError ? <div className="py-4 text-center text-sm text-stone-500">暂无官方插件</div> : null}
                    </div>
                </section>

                <section>
                    <div className="mb-2 text-sm font-semibold">第三方插件</div>
                    <Space.Compact className="w-full">
                        <Input value={customUrl} onChange={(event) => setCustomUrl(event.target.value)} placeholder="插件 JS 地址" onPressEnter={() => void installCustom()} />
                        <Button type="primary" icon={<UploadCloud className="size-4" />} loading={busyId === "custom"} onClick={() => void installCustom()}>
                            安装
                        </Button>
                    </Space.Compact>
                </section>

                <section>
                    <div className="mb-2 text-sm font-semibold">已安装</div>
                    <div className="space-y-2">
                        {plugins.map((plugin) => (
                            <div key={plugin.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2.5 dark:border-stone-800">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">{plugin.name}</div>
                                    <div className="mt-0.5 truncate text-xs text-stone-500">v{plugin.version} · {plugin.official ? "官方" : "第三方"}</div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <Switch size="small" checked={plugin.enabled} loading={busyId === plugin.id} onChange={(checked) => void toggle(plugin, checked)} />
                                    <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={busyId === plugin.id} onClick={() => void update(plugin)} aria-label={`更新 ${plugin.name}`} />
                                    <Popconfirm title="卸载该插件？" okText="卸载" cancelText="取消" onConfirm={() => uninstallPlugin(plugin.id)}>
                                        <Button size="small" danger icon={<Trash2 className="size-3.5" />} aria-label={`卸载 ${plugin.name}`} />
                                    </Popconfirm>
                                </div>
                            </div>
                        ))}
                        {!plugins.length ? <div className="py-4 text-center text-sm text-stone-500">尚未安装插件</div> : null}
                    </div>
                </section>
            </div>
        </Modal>
    );
}
