"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { App, Avatar, Button, Card, Col, Divider, Flex, Form, Input, InputNumber, Modal, Row, Select, Space, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import type { AdminUser } from "@/services/api/admin";
import { useAdminUsers } from "./use-admin-users";

type UserFormValues = Partial<AdminUser> & { password?: string };

const roleOptions = [
    { label: "普通用户", value: "user" },
    { label: "管理员", value: "admin" },
];

const statusOptions = [
    { label: "正常", value: "active" },
    { label: "禁用", value: "ban" },
];

export default function AdminUsersPage() {
    const { message } = App.useApp();
    const { users, keyword, page, pageSize, total, isLoading, searchUsers, changePage, changePageSize, resetFilters, refreshUsers, saveUser: saveAdminUser, adjustCredits, deleteUser } = useAdminUsers();
    const [form] = Form.useForm<UserFormValues>();
    const [batchForm] = Form.useForm<{ credits: number }>();
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingUser, setEditingUser] = useState<Partial<AdminUser> | null>(null);
    const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
    const [batchCreditsOpen, setBatchCreditsOpen] = useState(false);
    const [batchProcessing, setBatchProcessing] = useState(false);

    useEffect(() => setKeywordText(keyword), [keyword]);

    useEffect(() => {
        if (editingUser) form.setFieldsValue({ role: "user", status: "active", ...editingUser, password: "" });
    }, [editingUser, form]);

    const saveUser = async () => {
        const value = await form.validateFields();
        const userValue = { ...value };
        delete userValue.credits;
        await saveAdminUser({ ...editingUser, ...userValue, password: value.password || undefined });
        setEditingUser(null);
    };

    const saveCredits = async () => {
        if (!editingUser?.id) return;
        await adjustCredits(editingUser.id, form.getFieldValue("credits") || 0);
    };

    const handleBatchCredits = async () => {
        const values = await batchForm.validateFields();
        const delta = values.credits;
        if (!delta || delta === 0) {
            message.warning("请输入调整数量");
            return;
        }
        setBatchProcessing(true);
        let success = 0;
        let failed = 0;
        for (const id of selectedRowKeys) {
            try {
                const user = users.find((u) => u.id === id);
                const current = user?.credits ?? 0;
                const next = Math.max(0, current + delta);
                await adjustCredits(id, next);
                success++;
            } catch {
                failed++;
            }
        }
        setBatchProcessing(false);
        setBatchCreditsOpen(false);
        batchForm.resetFields();
        setSelectedRowKeys([]);
        if (success > 0) message.success(`已调整 ${success} 个用户的算力点`);
        if (failed > 0) message.error(`${failed} 个用户调整失败`);
    };

    const columns: ProColumns<AdminUser>[] = [
        {
            title: "用户",
            dataIndex: "username",
            width: 260,
            render: (_, item) => (
                <Flex align="center" gap={10} style={{ minWidth: 0 }}>
                    <Avatar src={item.avatarUrl || undefined}>{(item.displayName || item.username || "U").slice(0, 1).toUpperCase()}</Avatar>
                    <Flex vertical style={{ minWidth: 0 }}>
                        <Typography.Text strong ellipsis>
                            {item.displayName || item.username}
                        </Typography.Text>
                        <Typography.Text type="secondary" ellipsis>
                            {item.username}
                        </Typography.Text>
                    </Flex>
                </Flex>
            ),
        },
        {
            title: "角色",
            dataIndex: "role",
            width: 100,
            render: (_, item) => <Tag color={item.role === "admin" ? "gold" : "default"}>{item.role === "admin" ? "管理员" : "用户"}</Tag>,
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 90,
            render: (_, item) => <Tag color={item.status === "ban" ? "red" : "green"}>{item.status === "ban" ? "禁用" : "正常"}</Tag>,
        },
        {
            title: "算力点",
            dataIndex: "credits",
            width: 100,
            render: (_, item) => <Typography.Text>{item.credits}</Typography.Text>,
        },
        {
            title: "订阅",
            dataIndex: "subscription",
            width: 180,
            render: (_, item) =>
                item.subscription ? (
                    <Space direction="vertical" size={0}>
                        <Tag color="blue">{item.subscription.plan.name}</Tag>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            至 {dayjs(item.subscription.subscription.endsAt).format("YYYY-MM-DD")}
                        </Typography.Text>
                    </Space>
                ) : (
                    <Tag>未订阅</Tag>
                ),
        },
        {
            title: "Linux.do",
            dataIndex: "linuxDoId",
            width: 140,
            render: (_, item) => <Typography.Text type="secondary">{item.linuxDoId || "-"}</Typography.Text>,
        },
        {
            title: "最近登录",
            dataIndex: "lastLoginAt",
            width: 180,
            render: (_, item) => <Typography.Text type="secondary">{item.lastLoginAt ? dayjs(item.lastLoginAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 96,
            align: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingUser(item)} />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingUser(item)} />
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
                                    <Input.Search value={keywordText} placeholder="搜索用户名或昵称" allowClear enterButton={<SearchOutlined />} onSearch={() => searchUsers(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
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
                <ProTable<AdminUser>
                    rowKey="id"
                    columns={columns}
                    dataSource={users}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    rowSelection={{
                        selectedRowKeys,
                        onChange: (keys) => setSelectedRowKeys(keys as string[]),
                    }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>用户列表</Typography.Text>
                            <Tag>{total} 人</Tag>
                            {selectedRowKeys.length > 0 ? <Tag color="blue">已选 {selectedRowKeys.length} 人</Tag> : null}
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshUsers() }}
                    toolBarRender={() => [
                        selectedRowKeys.length > 0 ? (
                            <Button key="batchCredits" onClick={() => setBatchCreditsOpen(true)}>
                                批量调整算力点
                            </Button>
                        ) : null,
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingUser({ role: "user", status: "active" })}>
                            新增
                        </Button>,
                    ]}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 人`,
                        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
                    }}
                />
            </Flex>

            <Modal title={editingUser?.id ? "编辑用户" : "新增用户"} open={Boolean(editingUser)} width={680} onCancel={() => setEditingUser(null)} onOk={() => void saveUser()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Typography.Text strong>基础信息</Typography.Text>
                    <Row gutter={14}>
                        <Col span={12}>
                            <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="password" label={editingUser?.id ? "新密码" : "密码"} rules={editingUser?.id ? [] : [{ required: true, message: "请输入密码" }]}>
                                <Input.Password autoComplete="new-password" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="displayName" label="昵称">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="email" label="邮箱">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="role" label="角色" rules={[{ required: true, message: "请选择角色" }]}>
                                <Select options={roleOptions} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
                                <Select options={statusOptions} />
                            </Form.Item>
                        </Col>
                    </Row>
                    {editingUser?.id ? (
                        <>
                            <Divider style={{ margin: "4px 0 16px" }} />
                            <Typography.Text strong>算力点调整</Typography.Text>
                            <Row gutter={14}>
                                <Col span={12}>
                                    <Form.Item label="算力点">
                                        <Space.Compact style={{ width: "100%" }}>
                                            <Form.Item name="credits" noStyle>
                                                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                                            </Form.Item>
                                            <Button onClick={() => void saveCredits()}>调整</Button>
                                        </Space.Compact>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </>
                    ) : null}
                </Form>
            </Modal>

            <Modal
                title="删除用户"
                open={Boolean(deletingUser)}
                onCancel={() => setDeletingUser(null)}
                onOk={async () => {
                    if (!deletingUser) return;
                    await deleteUser(deletingUser.id);
                    setDeletingUser(null);
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除「{deletingUser?.displayName || deletingUser?.username}」吗？删除后该账号将无法继续登录。
            </Modal>

            <Modal
                title={`批量调整算力点（已选 ${selectedRowKeys.length} 人）`}
                open={batchCreditsOpen}
                onCancel={() => {
                    setBatchCreditsOpen(false);
                    batchForm.resetFields();
                }}
                onOk={() => void handleBatchCredits()}
                okText="确认调整"
                cancelText="取消"
                confirmLoading={batchProcessing}
                destroyOnHidden
            >
                <Form form={batchForm} layout="vertical" requiredMark={false}>
                    <Form.Item name="credits" label="调整数量" rules={[{ required: true, message: "请输入调整数量" }]}>
                        <InputNumber precision={0} style={{ width: "100%" }} placeholder="正数增加，负数减少" />
                    </Form.Item>
                    <Typography.Text type="secondary">输入正数为所有选中用户增加算力点，输入负数则减少。减少时不会低于 0。</Typography.Text>
                </Form>
            </Modal>
        </main>
    );
}
