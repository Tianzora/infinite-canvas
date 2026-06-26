"use client";

import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";
import { App, Avatar, Button, Dropdown, Modal, Table, Tag, Tooltip, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import { Gift, Keyboard, LogOut, MessageSquare, Settings2, Shield } from "lucide-react";
import type { ItemType } from "antd/es/menu/interface";
import Link from "next/link";

import { CouponRedeemModal } from "@/components/coupon-redeem-modal";
import { AnnouncementNoticeButton } from "@/components/announcement-notice-button";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { CreditSymbol } from "@/constant/credits";
import { cn } from "@/lib/utils";
import { canvasThemes } from "@/lib/canvas-theme";
import { fetchCreditLogs, type CreditLog } from "@/services/api/credit-logs";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    showVersion?: boolean;
    versionSource?: "local" | "upstream";
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    accountOpen?: boolean;
    onAccountOpenChange?: (open: boolean) => void;
    accountRef?: RefObject<HTMLDivElement | null>;
    getPopupContainer?: (node: HTMLElement) => HTMLElement;
};

const creditLogTypeLabels: Record<string, string> = {
    admin_adjust: "后台调整",
    ai_consume: "模型消费",
    ai_refund: "失败返还",
    redeem: "兑换码",
};

export function UserStatusActions({ showConfig = true, showVersion = false, versionSource = "local", variant = "default", onOpenShortcuts, accountOpen, onAccountOpenChange, accountRef, getPopupContainer }: UserStatusActionsProps) {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const isUserReady = useUserStore((state) => state.isReady);
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const logout = useUserStore((state) => state.clearSession);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const rechargeUrl = useConfigStore((state) => state.publicSettings?.billing?.rechargeUrl?.trim() || "");
    const canvasTheme = canvasThemes[theme];
    const userName = user?.displayName || user?.username || "";
    const [redeemOpen, setRedeemOpen] = useState(false);
    const [creditLogsOpen, setCreditLogsOpen] = useState(false);
    const credits = user?.credits ?? 0;
    const avatarUrl = user?.avatarUrl?.trim();
    const avatarText = (userName.trim()[0] || "U").toUpperCase();
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const versionStyle = iconStyle;
    const creditStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const avatarStyle: CSSProperties | undefined = variant === "canvas" ? { borderColor: canvasTheme.toolbar.border, color: canvasTheme.node.text, background: "transparent" } : undefined;

    useEffect(() => {
        if (!user) setCreditLogsOpen(false);
    }, [user]);

    const menuItems: ItemType[] = [
        { key: "user", disabled: true, label: <span className="font-medium text-current">{userName}</span> },
        ...(user?.role === "admin" ? [{ key: "admin", icon: <Shield className="size-4" />, label: <Link href="/admin">管理后台</Link> }] : []),
        ...(onOpenShortcuts ? [{ key: "shortcuts", icon: <Keyboard className="size-4" />, label: "快捷键", onClick: onOpenShortcuts }] : []),
        { key: "redeem", icon: <Gift className="size-4" />, label: "兑换码", onClick: () => setRedeemOpen(true) },
        { key: "tickets", icon: <MessageSquare className="size-4" />, label: <Link href="/tickets">提交工单</Link> },
        { type: "divider" },
        { key: "logout", icon: <LogOut className="size-4" />, label: "退出登录", onClick: logout },
    ];

    return (
        <>
        <div className="inline-flex shrink-0 items-center gap-1">
            {showConfig ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
            {showVersion ? <VersionReleaseModal style={versionStyle} source={versionSource} /> : null}
            {isUserReady ? <AnnouncementNoticeButton userId={user?.id} className={naturalIconClass} style={iconStyle} /> : null}
            {user ? (
                <Tooltip title="算力点变动记录" placement="bottom">
                    <button type="button" className={cn("flex h-8 shrink-0 items-center gap-1.5 px-1.5 text-xs font-medium tabular-nums opacity-75 transition hover:opacity-100", variant === "default" && "text-stone-600 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white")} style={creditStyle} onClick={() => setCreditLogsOpen(true)}>
                        <CreditSymbol className="text-sm leading-none" />
                        <span>{credits.toLocaleString()}</span>
                    </button>
                </Tooltip>
            ) : null}
            {!user && onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
            {!user ? (
                <Link href="/login" className="px-1.5 text-sm font-medium text-stone-600 underline-offset-4 transition hover:text-stone-950 hover:underline dark:text-stone-300 dark:hover:text-stone-100" style={iconStyle}>
                    登录
                </Link>
            ) : null}
            {user ? (
                <div ref={accountRef}>
                    <Dropdown open={accountOpen} onOpenChange={onAccountOpenChange} trigger={["click"]} placement="bottomRight" getPopupContainer={getPopupContainer} styles={{ root: { minWidth: 150 } }} menu={{ items: menuItems }}>
                        <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-transparent p-0 text-[0] leading-[0] transition" aria-label="账户菜单">
                            <Avatar
                                size={24}
                                src={avatarUrl ? <img src={avatarUrl} alt={userName} referrerPolicy="no-referrer" /> : undefined}
                                alt={userName}
                                className="!flex !items-center !justify-center border border-stone-300 bg-transparent text-[11px] font-semibold text-stone-800 transition hover:border-stone-500 hover:text-stone-950 dark:border-stone-700 dark:text-stone-100 dark:hover:border-stone-400 dark:hover:text-white"
                                style={avatarStyle}
                            >
                                {avatarText}
                            </Avatar>
                        </button>
                    </Dropdown>
                </div>
            ) : null}
        </div>
            <CouponRedeemModal open={redeemOpen} onClose={() => setRedeemOpen(false)} rechargeUrl={rechargeUrl} />
            <CreditLogsModal open={creditLogsOpen} onClose={() => setCreditLogsOpen(false)} token={token} hydrateUser={hydrateUser} rechargeUrl={rechargeUrl} />
    </>
    );
}

function CreditLogsModal({ open, onClose, token, hydrateUser, rechargeUrl }: { open: boolean; onClose: () => void; token: string; hydrateUser: () => Promise<void>; rechargeUrl: string }) {
    const { message } = App.useApp();
    const [logs, setLogs] = useState<CreditLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [loading, setLoading] = useState(false);

    const columns = useMemo<TableProps<CreditLog>["columns"]>(
        () => [
            {
                title: "类型",
                dataIndex: "type",
                width: 110,
                render: (_, item) => <Tag>{creditLogTypeLabels[item.type] || item.type || "-"}</Tag>,
            },
            {
                title: "变动",
                dataIndex: "amount",
                width: 90,
                align: "right",
                render: (_, item) => <Typography.Text type={item.amount >= 0 ? "success" : "danger"}>{item.amount > 0 ? `+${item.amount}` : item.amount}</Typography.Text>,
            },
            {
                title: "余额",
                dataIndex: "balance",
                width: 90,
                align: "right",
            },
            {
                title: "备注",
                dataIndex: "remark",
                ellipsis: true,
                render: (_, item) => <Typography.Text type="secondary">{item.remark || "-"}</Typography.Text>,
            },
            {
                title: "时间",
                dataIndex: "createdAt",
                width: 170,
                render: (_, item) => <Typography.Text type="secondary">{item.createdAt ? dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Typography.Text>,
            },
        ],
        [],
    );

    useEffect(() => {
        if (!open || !token) return;
        let ignore = false;
        const loadLogs = async () => {
            setLoading(true);
            try {
                const [data] = await Promise.all([fetchCreditLogs(token, { page, pageSize }), hydrateUser()]);
                if (ignore) return;
                setLogs(data.items);
                setTotal(data.total);
            } catch (error) {
                if (!ignore) message.error(error instanceof Error ? error.message : "读取算力点记录失败");
            } finally {
                if (!ignore) setLoading(false);
            }
        };
        void loadLogs();
        return () => {
            ignore = true;
        };
    }, [hydrateUser, message, open, page, pageSize, token]);

    return (
        <Modal title="算力点变动记录" open={open} onCancel={onClose} footer={null} destroyOnHidden width={760}>
            {rechargeUrl ? (
                <div className="mb-3 flex justify-end">
                    <Button type="primary" size="small" href={rechargeUrl} target="_blank" rel="noreferrer">
                        购买
                    </Button>
                </div>
            ) : null}
            <Table<CreditLog>
                rowKey="id"
                size="small"
                tableLayout="fixed"
                columns={columns}
                dataSource={logs}
                loading={loading}
                scroll={{ x: 680 }}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    pageSizeOptions: [10, 20, 50],
                    showTotal: (value) => `共 ${value} 条`,
                    onChange: (nextPage, nextPageSize) => {
                        setPage(nextPageSize !== pageSize ? 1 : nextPage);
                        setPageSize(nextPageSize);
                    },
                }}
            />
        </Modal>
    );
}

