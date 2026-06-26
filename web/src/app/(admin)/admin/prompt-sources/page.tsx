"use client";

import { DeleteOutlined, EditOutlined, ExportOutlined, PlusOutlined, SyncOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Form, Input, Modal, Select, Space, Switch, Typography } from "antd";
import { useEffect, useState } from "react";

import type { PromptSource } from "@/services/api/admin";
import { useAdminPromptSources } from "./use-admin-prompt-sources";

const templateOptions = [
    { label: "JSON 数据文件", value: "json" },
    { label: "README Markdown", value: "readme" },
];

const jsonPlaceholder = JSON.stringify({ dataPath: "records", title: "title", prompt: "prompt", image: "image", imageSuffix: ".jpg", tags: ["tag"], idPrefix: "source" }, null, 2);

const readmePlaceholder = `{"sectionPrefix":"### ","titlePattern":"(?m)^###\\s+(.+)$","promptPattern":"(?s)\u63d0\u793a\u8bcd\\s*\\r?\\n\\s*`{3}[\\w-]*\\r?\\n(.*?)\\r?\\n`{3}","tags":["tag"],"idPrefix":"source"}`;

export default function AdminPromptSourcesPage() {
    const { sources, isLoading, isSaving, isSyncing, saveSource, deleteSource, syncSource } = useAdminPromptSources();
    const [form] = Form.useForm<Partial<PromptSource> & { parseConfigText?: string }>();
    const [editingSource, setEditingSource] = useState<Partial<PromptSource> | null>(null);
    const [deletingSource, setDeletingSource] = useState<PromptSource | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const templateType = Form.useWatch("templateType", form) || "json";

    useEffect(() => {
        if (editingSource) {
            form.setFieldsValue({
                ...editingSource,
                parseConfigText: editingSource.parseConfig ? JSON.stringify(editingSource.parseConfig, null, 2) : "",
            });
        }
    }, [editingSource, form]);

    const openCreate = () => {
        setEditingSource({ enabled: true, templateType: "json" });
        setIsEditOpen(true);
    };

    const openEdit = (source: PromptSource) => {
        setEditingSource(source);
        setIsEditOpen(true);
    };

    const handleSave = async () => {
        const values = await form.validateFields();
        let parseConfig = {};
        try { parseConfig = values.parseConfigText ? JSON.parse(values.parseConfigText) : {}; }
        catch { form.setFields([{ name: "parseConfigText", errors: ["JSON 格式不正确"] }]); return; }
        await saveSource({ ...editingSource, ...values, parseConfig });
        setIsEditOpen(false);
        setEditingSource(null);
    };

    const handleToggle = async (source: PromptSource, enabled: boolean) => {
        await saveSource({ ...source, enabled });
    };

    const columns: ProColumns<PromptSource>[] = [
        { title: "名称", dataIndex: "name", width: 200, ellipsis: true },
        { title: "分类编码", dataIndex: "category", width: 200, ellipsis: true, render: (_, r) => <Typography.Text type="secondary">{r.category}</Typography.Text> },
        { title: "模板", dataIndex: "templateType", width: 120, render: (_, r) => <Typography.Text code>{r.templateType}</Typography.Text> },
        { title: "提示词数", dataIndex: "promptCount", width: 90, align: "center" },
        { title: "启用", dataIndex: "enabled", width: 80, align: "center", render: (_, r) => <Switch size="small" checked={r.enabled} loading={isSaving} onChange={(v) => handleToggle(r, v)} /> },
        { title: "上次同步", dataIndex: "syncedAt", width: 160, render: (_, r) => r.syncedAt ? new Date(r.syncedAt).toLocaleString("zh-CN") : "-" },
        {
            title: "操作", key: "actions", width: 160, align: "right",
            render: (_, r) => (
                <Space size={4}>
                    <Button type="text" size="small" icon={<SyncOutlined />} loading={isSyncing} onClick={() => syncSource(r.category)} />
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                    {r.githubUrl ? <Button type="text" size="small" icon={<ExportOutlined />} href={r.githubUrl} target="_blank" /> : null}
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeletingSource(r)} />
                </Space>
            ),
        },
    ];

    return (
        <main style={{ padding: 24 }}>
            <ProTable<PromptSource>
                rowKey="category"
                search={false}
                dataSource={sources}
                columns={columns}
                loading={isLoading}
                pagination={false}
                toolBarRender={() => [
                    <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                        新增远程源
                    </Button>,
                ]}
            />

            <Modal
                title={editingSource?.category && editingSource.createdAt ? "编辑远程源" : "新增远程源"}
                open={isEditOpen}
                width={720}
                onCancel={() => { setIsEditOpen(false); setEditingSource(null); }}
                onOk={handleSave}
                confirmLoading={isSaving}
                okText="保存"
                cancelText="取消"
            >
                <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item name="category" label="分类编码" rules={[{ required: true, message: "请输入分类编码" }]} extra="唯一标识，保存后不可修改">
                        <Input disabled={Boolean(editingSource?.createdAt)} placeholder="my-awesome-prompts" />
                    </Form.Item>
                    <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
                        <Input placeholder="我的提示词源" />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <Input placeholder="可选描述" />
                    </Form.Item>
                    <Form.Item name="githubUrl" label="GitHub 地址">
                        <Input placeholder="https://github.com/..." />
                    </Form.Item>
                    <Form.Item name="sourceUrl" label="数据文件 URL" rules={[{ required: true, message: "请输入数据文件 URL" }]} extra="JSON 模板填 JSON 文件地址，README 模板填 Markdown 文件地址">
                        <Input placeholder="https://raw.githubusercontent.com/.../data.json" />
                    </Form.Item>
                    <Form.Item name="templateType" label="模板类型" rules={[{ required: true }]}>
                        <Select options={templateOptions} />
                    </Form.Item>
                    <Form.Item name="parseConfigText" label="解析配置 (JSON)" rules={[{ required: true, message: "请输入解析配置" }]} extra="JSON 对象，定义标题、提示词、图片等字段的提取规则">
                        <Input.TextArea rows={8} placeholder={templateType === "readme" ? readmePlaceholder : jsonPlaceholder} style={{ fontFamily: "monospace", fontSize: 12 }} />
                    </Form.Item>
                    <Form.Item name="imageBaseUrl" label="图片基础 URL" extra="留空则自动从数据文件 URL 推导">
                        <Input placeholder="https://raw.githubusercontent.com/.../main" />
                    </Form.Item>
                    <Form.Item name="enabled" label="启用" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="删除远程源"
                open={Boolean(deletingSource)}
                onCancel={() => setDeletingSource(null)}
                onOk={async () => { if (!deletingSource) return; await deleteSource(deletingSource.category); setDeletingSource(null); }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除「{deletingSource?.name}」吗？该源下的所有提示词也会一并删除。
            </Modal>
        </main>
    );
}
