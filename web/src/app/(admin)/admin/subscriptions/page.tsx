"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Drawer, Flex, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Tabs, Tag, Tooltip, Typography } from "antd";
import { useEffect, useState } from "react";

import type { SubscriptionPlan } from "@/services/api/subscriptions";
import { useAdminSubscriptions } from "./use-admin-subscriptions";

const periodOptions = [
    { label: "月付", value: "monthly" },
    { label: "季付", value: "quarterly" },
    { label: "年付", value: "yearly" },
] as const;

const periodLabels: Record<string, string> = {
    monthly: "月",
    quarterly: "季",
    yearly: "年",
};

export default function AdminSubscriptionsPage() {
    const { plans, keyword, page, pageSize, total, isLoading, searchPlans, changePage, changePageSize, resetFilters, refreshPlans, savePlan, disablePlan } = useAdminSubscriptions();
    const [form] = Form.useForm<Partial<SubscriptionPlan>>();
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingPlan, setEditingPlan] = useState<Partial<SubscriptionPlan> | null>(null);
    const [disablingPlan, setDisablingPlan] = useState<SubscriptionPlan | null>(null);

    useEffect(() => setKeywordText(keyword), [keyword]);
    useEffect(() => {
        if (editingPlan) form.setFieldsValue({ period: "monthly", isActive: true, sortOrder: 0, ...editingPlan });
    }, [editingPlan, form]);

    const handleSave = async () => {
        const values = await form.validateFields();
        await savePlan({ ...editingPlan, ...values });
        setEditingPlan(null);
    };

    const columns: ProColumns<SubscriptionPlan>[] = [
        { title: "套餐", dataIndex: "name", render: (_, item) => <Typography.Text strong>{item.name}</Typography.Text> },
        { title: "周期", dataIndex: "period", width: 80, render: (_, item) => <Tag>{periodLabels[item.period] || item.period}</Tag> },
        { title: "每日算力点", dataIndex: "dailyQuota", width: 110 },
        { title: "每月算力点", dataIndex: "monthlyQuota", width: 110 },
        { title: "价格", dataIndex: "priceText", width: 120, render: (_, item) => <Typography.Text>{item.priceText || "-"}</Typography.Text> },
        { title: "排序", dataIndex: "sortOrder", width: 80 },
        { title: "启用", dataIndex: "isActive", width: 80, render: (_, item) => <Tag color={item.isActive ? "green" : "default"}>{item.isActive ? "启用" : "停用"}</Tag> },
        {
            title: "操作",
            key: "actions",
            width: 96,
            align: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingPlan(item)} />
                    </Tooltip>
                    <Tooltip title="停用">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} disabled={!item.isActive} onClick={() => setDisablingPlan(item)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <main style={{ padding: 24 }}>
            <Tabs
                items={[
                    {
                        key: "plans",
                        label: "套餐配置",
                        children: (
                            <Flex vertical gap={16}>
                                <Card variant="borderless">
                                    <Form layout="vertical">
                                        <Row gutter={16} align="bottom">
                                            <Col flex="360px">
                                                <Form.Item label="关键词">
                                                    <Input.Search value={keywordText} placeholder="搜索套餐名或简介" allowClear enterButton={<SearchOutlined />} onSearch={() => searchPlans(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
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
                                <ProTable<SubscriptionPlan>
                                    rowKey="id"
                                    columns={columns}
                                    dataSource={plans}
                                    loading={isLoading}
                                    search={false}
                                    defaultSize="middle"
                                    tableLayout="fixed"
                                    cardProps={{ variant: "borderless" }}
                                    headerTitle={
                                        <Space>
                                            <Typography.Text strong>订阅套餐</Typography.Text>
                                            <Tag>{total} 个</Tag>
                                        </Space>
                                    }
                                    options={{ density: true, setting: true, reload: () => void refreshPlans() }}
                                    toolBarRender={() => [
                                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingPlan({ period: "monthly", isActive: true })}>
                                            新建套餐
                                        </Button>,
                                    ]}
                                    pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (value) => `共 ${value} 个`, onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)) }}
                                />
                            </Flex>
                        ),
                    },
                    {
                        key: "notes",
                        label: "说明",
                        children: (
                            <Card variant="borderless">
                                <Typography.Paragraph>订阅只通过兑换码开通或续期，不包含支付和自动续费。</Typography.Paragraph>
                                <Typography.Paragraph type="warning">警告：订阅有效期内再次兑换订阅码会直接覆盖当前套餐和订阅时间，并重置订阅消耗状态，不会延期。</Typography.Paragraph>
                                <Typography.Paragraph>订阅额度就是算力点；AI 消耗优先使用订阅算力点，每日按服务器日期统计，每月按自然月刷新。</Typography.Paragraph>
                            </Card>
                        ),
                    },
                ]}
            />
            <Drawer title={editingPlan?.id ? "编辑套餐" : "新建套餐"} open={Boolean(editingPlan)} onClose={() => setEditingPlan(null)} width={560} extra={<Button type="primary" onClick={() => void handleSave()}>保存</Button>}>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Row gutter={14}>
                        <Col span={12}><Form.Item name="name" label="套餐名" rules={[{ required: true, message: "请输入套餐名" }]}><Input /></Form.Item></Col>
                        <Col span={12}><Form.Item name="period" label="周期" rules={[{ required: true, message: "请选择周期" }]}><Select options={[...periodOptions]} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="dailyQuota" label="每日算力点" rules={[{ required: true, message: "请输入每日算力点" }]}><InputNumber min={1} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="monthlyQuota" label="每月算力点" rules={[{ required: true, message: "请输入每月算力点" }]}><InputNumber min={1} precision={0} style={{ width: "100%" }} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="priceText" label="展示价格"><Input placeholder="如 ¥29/月" /></Form.Item></Col>
                        <Col span={12}><Form.Item name="sortOrder" label="排序"><InputNumber precision={0} style={{ width: "100%" }} /></Form.Item></Col>
                        <Col span={24}><Form.Item name="description" label="简介"><Input.TextArea rows={3} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="isActive" label="启用" valuePropName="checked"><Switch /></Form.Item></Col>
                    </Row>
                </Form>
            </Drawer>
            <Modal title="停用套餐" open={Boolean(disablingPlan)} onCancel={() => setDisablingPlan(null)} onOk={async () => { if (!disablingPlan) return; await disablePlan(disablingPlan.id); setDisablingPlan(null); }} okText="停用" okButtonProps={{ danger: true }} cancelText="取消">
                停用后不能再生成该套餐的新订阅兑换码。确定停用「{disablingPlan?.name}」吗？
            </Modal>
        </main>
    );
}
