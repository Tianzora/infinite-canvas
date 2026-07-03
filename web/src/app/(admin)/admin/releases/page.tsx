"use client";

import { DeleteOutlined, EditOutlined, ExperimentOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Drawer, Flex, Form, Input, Modal, Row, Select, Space, Switch, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";

import type { AdminRelease } from "@/services/api/admin-releases";
import { modelOptionLabel, useEffectiveConfig } from "@/stores/use-config-store";
import { useAdminReleases } from "./use-admin-releases";

type ReleaseFormValues = {
    version: string;
    title: string;
    releaseDate: string;
    summary: string;
    active: boolean;
    itemsText: string;
};

type GenerateFormValues = {
    version: string;
    title: string;
    notes: string;
    model: string;
};

function parseItemsText(text: string): AdminRelease["items"] {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const match = line.match(/^\+\s+\[(.+?)\]\s+(.+)$/);
            if (match) return { type: match[1], content: match[2] };
            return null;
        })
        .filter((item): item is { type: string; content: string } => Boolean(item));
}

function itemsToText(items: AdminRelease["items"]): string {
    return items.map((item) => `+ [${item.type}] ${item.content}`).join("\n");
}

export default function AdminReleasesPage() {
    const {
        releases,
        keyword,
        page,
        pageSize,
        total,
        isLoading,
        isGenerating,
        searchReleases,
        changePage,
        changePageSize,
        resetFilters,
        refreshReleases,
        saveRelease,
        deleteRelease,
        generateRelease,
    } = useAdminReleases();

    const [form] = Form.useForm<ReleaseFormValues>();
    const [generateForm] = Form.useForm<GenerateFormValues>();
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingItem, setEditingItem] = useState<Partial<AdminRelease> | null>(null);
    const [deletingItem, setDeletingItem] = useState<AdminRelease | null>(null);
    const [generateOpen, setGenerateOpen] = useState(false);
    const effectiveConfig = useEffectiveConfig();
    const textModels = useMemo(() => Array.from(new Set([effectiveConfig.textModel, ...effectiveConfig.textModels].filter(Boolean))), [effectiveConfig.textModel, effectiveConfig.textModels]);

    useEffect(() => setKeywordText(keyword), [keyword]);

    useEffect(() => {
        if (editingItem) {
            form.setFieldsValue({
                version: editingItem.version || "",
                title: editingItem.title || "",
                releaseDate: editingItem.releaseDate || dayjs().format("YYYY-MM-DD"),
                summary: editingItem.summary || "",
                active: editingItem.active ?? true,
                itemsText: itemsToText(editingItem.items || []),
            });
        }
    }, [editingItem, form]);

    const handleSave = async () => {
        const values = await form.validateFields();
        const items = parseItemsText(values.itemsText);
        await saveRelease({
            ...editingItem,
            version: values.version,
            title: values.title,
            releaseDate: values.releaseDate,
            summary: values.summary,
            active: values.active,
            items,
        });
        setEditingItem(null);
    };

    const handleToggleActive = async (item: AdminRelease) => {
        await saveRelease({ ...item, active: !item.active });
    };

    const handleGenerate = async () => {
        const values = await generateForm.validateFields();
        await generateRelease(values);
        setGenerateOpen(false);
        generateForm.resetFields();
    };

    const openGenerate = () => {
        generateForm.setFieldsValue({ model: effectiveConfig.textModel || effectiveConfig.model });
        setGenerateOpen(true);
    };

    const columns: ProColumns<AdminRelease>[] = [
        {
            title: "版本号",
            dataIndex: "version",
            width: 140,
            render: (_, item) => <Typography.Text strong>{item.version}</Typography.Text>,
        },
        {
            title: "标题",
            dataIndex: "title",
            ellipsis: true,
        },
        {
            title: "来源",
            dataIndex: "source",
            width: 90,
            render: (_, item) => <Tag color={item.source === "ai_record" ? "purple" : "default"}>{item.source === "ai_record" ? "AI" : "手动"}</Tag>,
        },
        {
            title: "状态",
            dataIndex: "active",
            width: 80,
            render: (_, item) => <Switch size="small" checked={item.active} onChange={() => void handleToggleActive(item)} />,
        },
        {
            title: "发布日期",
            dataIndex: "releaseDate",
            width: 120,
            render: (_, item) => <Typography.Text type="secondary">{item.releaseDate || "-"}</Typography.Text>,
        },
        {
            title: "更新时间",
            dataIndex: "updatedAt",
            width: 170,
            render: (_, item) => <Typography.Text type="secondary">{item.updatedAt ? dayjs(item.updatedAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 96,
            align: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingItem(item)} />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingItem(item)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input.Search value={keywordText} placeholder="搜索版本号、标题或摘要" allowClear enterButton={<SearchOutlined />} onSearch={() => searchReleases(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item>
                                    <Button
                                        icon={<ReloadOutlined />}
                                        onClick={() => {
                                            setKeywordText("");
                                            resetFilters();
                                        }}
                                    >
                                        重置
                                    </Button>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>
                <ProTable<AdminRelease>
                    rowKey="id"
                    columns={columns}
                    dataSource={releases}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>版本记录</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshReleases() }}
                    toolBarRender={() => [
                        <Button key="generate" icon={<ExperimentOutlined />} onClick={openGenerate}>
                            AI 生成
                        </Button>,
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingItem({ active: true, releaseDate: dayjs().format("YYYY-MM-DD") })}>
                            新建记录
                        </Button>,
                    ]}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 条`,
                        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
                    }}
                />
            </Flex>

            <Drawer
                title={editingItem?.id ? "编辑版本记录" : "新建版本记录"}
                open={Boolean(editingItem)}
                onClose={() => setEditingItem(null)}
                width={640}
                extra={
                    <Button type="primary" onClick={() => void handleSave()}>
                        保存
                    </Button>
                }
            >
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Row gutter={14}>
                        <Col span={12}>
                            <Form.Item name="version" label="版本号" rules={[{ required: true, message: "请输入版本号" }]}>
                                <Input placeholder="v0.4.0" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="releaseDate" label="发布日期">
                                <Input placeholder="2026-06-17" />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="title" label="标题">
                                <Input placeholder="版本标题（可选）" />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="summary" label="摘要">
                                <Input.TextArea rows={3} placeholder="版本更新摘要（可选）" />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="itemsText" label="更新条目" tooltip="每行一条，格式：+ [类型] 内容，类型可选：新增、修复、调整、优化、文档">
                                <Input.TextArea rows={10} placeholder={`+ [新增] 某某功能\n+ [修复] 某某问题\n+ [调整] 某某优化`} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="active" label="启用" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Drawer>

            <Modal
                title="删除版本记录"
                open={Boolean(deletingItem)}
                onCancel={() => setDeletingItem(null)}
                onOk={async () => {
                    if (!deletingItem) return;
                    await deleteRelease(deletingItem.id);
                    setDeletingItem(null);
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除「{deletingItem?.version}」吗？
            </Modal>

            <Modal
                title="AI 自动生成版本记录"
                open={generateOpen}
                onCancel={() => {
                    setGenerateOpen(false);
                    generateForm.resetFields();
                }}
                onOk={() => void handleGenerate()}
                okText="生成"
                okButtonProps={{ loading: isGenerating }}
                cancelText="取消"
                destroyOnHidden
            >
                <Form form={generateForm} layout="vertical" requiredMark={false}>
                    <Form.Item name="version" label="版本号" rules={[{ required: true, message: "请输入版本号" }]}>
                        <Input placeholder="v0.4.0" />
                    </Form.Item>
                    <Form.Item name="title" label="标题">
                        <Input placeholder="版本标题（可选）" />
                    </Form.Item>
                    <Form.Item name="model" label="文本模型" rules={[{ required: true, message: "请选择文本模型" }]}>
                        <Select
                            showSearch
                            placeholder="选择用于整理更新记录的文本模型"
                            optionFilterProp="label"
                            options={textModels.map((model) => ({ label: modelOptionLabel(effectiveConfig, model), value: model }))}
                        />
                    </Form.Item>
                    <Form.Item name="notes" label="变更说明" tooltip="填写本次变更的要点，AI 会自动整理成结构化更新记录">
                        <Input.TextArea rows={6} placeholder="本次主要变更：&#10;- 新增了某某功能&#10;- 修复了某某问题&#10;- 调整了某某逻辑" />
                    </Form.Item>
                </Form>
            </Modal>
        </main>
    );
}
