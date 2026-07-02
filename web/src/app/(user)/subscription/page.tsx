"use client";

import { GiftOutlined, ReloadOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Empty, Flex, Form, Input, Progress, Row, Space, Statistic, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { previewCouponRedeem, redeemCoupon } from "@/services/api/coupons";
import { fetchMySubscription, fetchSubscriptionPlans, type SubscriptionPlan, type SubscriptionSummary } from "@/services/api/subscriptions";
import { useUserStore } from "@/stores/use-user-store";

const periodLabels: Record<string, string> = {
    monthly: "月",
    quarterly: "季",
    yearly: "年",
};

function quotaPercent(left: number, total: number) {
    return total > 0 ? Math.round((left / total) * 100) : 0;
}

function quotaColor(percent: number) {
    if (percent < 20) return "#ff4d4f";
    if (percent < 80) return "#faad14";
    return "#52c41a";
}

export default function SubscriptionPage() {
    const { message, modal } = App.useApp();
    const token = useUserStore((state) => state.token);
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [redeeming, setRedeeming] = useState(false);
    const [code, setCode] = useState("");

    const load = async () => {
        setLoading(true);
        try {
            const [planData, current] = await Promise.all([fetchSubscriptionPlans(), token ? fetchMySubscription(token) : Promise.resolve(null)]);
            setPlans(planData);
            setSummary(current);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取订阅失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [token]);

    const handleRedeem = async () => {
        if (!token) {
            message.error("请先登录");
            return;
        }
        if (!code.trim()) {
            message.error("请输入兑换码");
            return;
        }
        const redeemCode = code.trim();
        setRedeeming(true);
        try {
            const preview = await previewCouponRedeem(redeemCode, token);
            if (preview.willReplaceSubscription) {
                const confirmed = await modal.confirm({
                    title: "确认覆盖当前订阅？",
                    content: `该订阅兑换码${preview.planName ? `（${preview.planName}）` : ""}会覆盖当前套餐和订阅时间，并重置订阅消耗状态，不会延期。`,
                    okText: "确认覆盖",
                    cancelText: "取消",
                    okButtonProps: { danger: true },
                });
                if (!confirmed) return;
            }
            const result = await redeemCoupon(redeemCode, token);
            setSummary(result.subscription || null);
            setCode("");
            await hydrateUser();
            await load();
            message.success("兑换成功");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "兑换失败");
        } finally {
            setRedeeming(false);
        }
    };

    const todayTotal = (summary?.todayUsed || 0) + (summary?.todayLeft || 0);
    const monthTotal = (summary?.monthUsed || 0) + (summary?.monthLeft || 0);
    const todayLeftPercent = quotaPercent(summary?.todayLeft || 0, todayTotal);
    const monthLeftPercent = quotaPercent(summary?.monthLeft || 0, monthTotal);

    return (
        <main style={{ padding: 24, maxWidth: 1120, margin: "0 auto", overflow: "auto", height: "100%" }}>
            <Flex vertical gap={16}>
                <Card variant="borderless" loading={loading}>
                    <Flex justify="space-between" align="start" gap={16} wrap="wrap">
                        <div>
                            <Typography.Title level={4} style={{ marginTop: 0 }}>我的订阅</Typography.Title>
                            {summary ? (
                                <Space direction="vertical" size={4}>
                                    <Space>
                                        <Tag color="blue">{summary.plan.name}</Tag>
                                        <Typography.Text type="secondary">到期：{dayjs(summary.subscription.endsAt).format("YYYY-MM-DD HH:mm")}</Typography.Text>
                                    </Space>
                                    <Typography.Text type="secondary">订阅算力点将优先消耗，不足时自动使用余额算力点。有效期内再次兑换订阅码会覆盖当前套餐和订阅时间，并重置订阅消耗状态。</Typography.Text>
                                </Space>
                            ) : (
                                <Typography.Text type="secondary">当前没有有效订阅。使用兑换码开通。</Typography.Text>
                            )}
                        </div>
                        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
                    </Flex>
                    {summary ? (
                        <Row gutter={16} style={{ marginTop: 18 }}>
                            <Col xs={24} md={12}>
                                <Statistic title="今日剩余算力点" value={summary.todayLeft} suffix={`/ ${todayTotal} 算力点`} />
                                <Progress percent={todayLeftPercent} strokeColor={quotaColor(todayLeftPercent)} showInfo={false} />
                            </Col>
                            <Col xs={24} md={12}>
                                <Statistic title="本月剩余算力点" value={summary.monthLeft} suffix={`/ ${monthTotal} 算力点`} />
                                <Progress percent={monthLeftPercent} strokeColor={quotaColor(monthLeftPercent)} showInfo={false} />
                            </Col>
                        </Row>
                    ) : null}
                </Card>

                <Card variant="borderless">
                    <Form layout="vertical">
                        <Form.Item label="兑换码">
                            <Space.Compact style={{ width: "100%" }}>
                                <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} onPressEnter={() => void handleRedeem()} placeholder="输入订阅兑换码或算力点兑换码" />
                                <Button type="primary" icon={<GiftOutlined />} loading={redeeming} onClick={() => void handleRedeem()}>兑换</Button>
                            </Space.Compact>
                        </Form.Item>
                    </Form>
                </Card>

                <Row gutter={[16, 16]}>
                    {plans.length === 0 ? (
                        <Col span={24}><Empty description="暂无可用套餐" /></Col>
                    ) : (
                        plans.map((plan) => (
                            <Col key={plan.id} xs={24} md={8}>
                                <Card variant="borderless" style={{ height: "100%" }}>
                                    <Flex vertical gap={10}>
                                        <Space align="center">
                                            <Typography.Title level={5} style={{ margin: 0 }}>{plan.name}</Typography.Title>
                                            <Tag>{periodLabels[plan.period]}</Tag>
                                        </Space>
                                        <Typography.Title level={3} style={{ margin: 0 }}>{plan.priceText || "兑换码开通"}</Typography.Title>
                                        <Typography.Text type="secondary">{plan.description || "使用兑换码开通；有效期内重复兑换会覆盖当前订阅"}</Typography.Text>
                                        <Space>
                                            <Tag color="green">每日 {plan.dailyQuota} 算力点</Tag>
                                            <Tag color="blue">每月 {plan.monthlyQuota} 算力点</Tag>
                                        </Space>
                                    </Flex>
                                </Card>
                            </Col>
                        ))
                    )}
                </Row>
            </Flex>
        </main>
    );
}
