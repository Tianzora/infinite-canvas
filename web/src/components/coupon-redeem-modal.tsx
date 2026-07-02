"use client";

import { App, Button, Input, Modal, Space, Typography } from "antd";
import { useState } from "react";

import { previewCouponRedeem, redeemCoupon } from "@/services/api/coupons";
import type { SubscriptionSummary } from "@/services/api/subscriptions";
import { useUserStore } from "@/stores/use-user-store";

type CouponRedeemModalProps = {
    open: boolean;
    onClose: () => void;
    rechargeUrl?: string;
};

export function CouponRedeemModal({ open, onClose, rechargeUrl = "" }: CouponRedeemModalProps) {
    const { message, modal } = App.useApp();
    const token = useUserStore((state) => state.token);
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ balance: number; subscription?: SubscriptionSummary } | null>(null);

    const handleRedeem = async () => {
        if (!code.trim()) {
            message.error("请输入兑换码");
            return;
        }
        const redeemCode = code.trim();
        setLoading(true);
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
            const data = await redeemCoupon(redeemCode, token);
            setResult(data);
            setCode("");
            await hydrateUser();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "兑换失败");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setCode("");
        setResult(null);
        onClose();
    };

    return (
        <Modal title="兑换码" open={open} onCancel={handleClose} footer={null} destroyOnHidden width={400}>
            {result ? (
                <Space direction="vertical" align="center" style={{ width: "100%", padding: "16px 0" }}>
                    <Typography.Text type="success" style={{ fontSize: 16 }}>
                        兑换成功
                    </Typography.Text>
                    {result.subscription ? <Typography.Text>订阅：{result.subscription.plan.name}</Typography.Text> : null}
                    {result.subscription ? <Typography.Text type="secondary">到期时间：{new Date(result.subscription.subscription.endsAt).toLocaleString()}</Typography.Text> : null}
                    <Typography.Text type="secondary">当前余额：{result.balance} 算力点</Typography.Text>
                    <Button type="primary" onClick={handleClose} style={{ marginTop: 8 }}>
                        完成
                    </Button>
                </Space>
            ) : (
                <Space direction="vertical" style={{ width: "100%" }} size={12}>
                    <Input placeholder="请输入兑换码" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onPressEnter={() => void handleRedeem()} allowClear />
                    <Button type="primary" block loading={loading} onClick={() => void handleRedeem()}>
                        兑换
                    </Button>
                    {rechargeUrl ? (
                        <Button block href={rechargeUrl} target="_blank" rel="noreferrer">
                            购买
                        </Button>
                    ) : null}
                </Space>
            )}
        </Modal>
    );
}
