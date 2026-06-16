"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Flex, Form, Input, Modal, Row, Space, Switch, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import type { Announcement } from "@/services/api/announcements";
import { useAdminAnnouncements } from "./use-admin-announcements";

type AnnouncementFormValues = {
    title: string;
    content: string;
    active: boolean;
};

export default function AdminAnnouncementsPage() {
    const { announcements, keyword, page, pageSize, total, isLoading, searchAnnouncements, changePage, changePageSize, resetFilters, refreshAnnouncements, saveAnnouncement, deleteAnnouncement } = useAdminAnnouncements();
    const [form] = Form.useForm<AnnouncementFormValues>();
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingItem, setEditingItem] = useState<Partial<Announcement> | null>(null);
    const [deletingItem, setDeletingItem] = useState<Announcement | null>(null);

    useEffect(() => setKeywordText(keyword), [keyword]);

    useEffect(() => {
        if (editingItem) form.setFieldsValue({ title: editingItem.title || "", content: editingItem.content || "", active: editingItem.active ?? true });
    }, [editingItem, form]);

    const handleSave = async () => {
        const values = await form.validateFields();
        await saveAnnouncement({ ...editingItem, ...values });
        setEditingItem(null);
    };

    const handleToggleActive = async (item: Announcement) => {
        await saveAnnouncement({ ...item, active: !item.active });
    };

    const columns: ProColumns<Announcement>[] = [
        {
            title: "标题",
            dataIndex: "title",
            ellipsis: true,
            render: (_, item) => <Typography.Text strong ellipsis>{item.title}</Typography.Text>,
        },
        {
            title: "状态",
            dataIndex: "active",
            width: 100,
            render: (_, item) => <Switch size="small" checked={item.active} onChange={() => void handleToggleActive(item)} />,
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            width: 180,
            render: (_, item) => <Typography.Text type="secondary">{item.createdAt ? dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Typography.Text>,
        },
        {
            title: "更新时间",
            dataIndex: "updatedAt",
            width: 180,
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
                                    <Input.Search value={keywordText} placeholder="搜索标题或内容" allowClear enterButton={<SearchOutlined />} onSearch={() => searchAnnouncements(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
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
                <ProTable<Announcement>
                    rowKey="id"
                    columns={columns}
                    dataSource={announcements}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>公告列表</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshAnnouncements() }}
                    toolBarRender={() => [
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingItem({ active: true })}>
                            新建公告
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

            <Modal title={editingItem?.id ? "编辑公告" : "新建公告"} open={Boolean(editingItem)} onCancel={() => setEditingItem(null)} onOk={() => void handleSave()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Row gutter={14}>
                        <Col span={24}>
                            <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="content" label="内容">
                                <Input.TextArea rows={6} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="active" label="启用" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            <Modal
                title="删除公告"
                open={Boolean(deletingItem)}
                onCancel={() => setDeletingItem(null)}
                onOk={async () => {
                    if (!deletingItem) return;
                    await deleteAnnouncement(deletingItem.id);
                    setDeletingItem(null);
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除「{deletingItem?.title}」吗？
            </Modal>
        </main>
    );
}
