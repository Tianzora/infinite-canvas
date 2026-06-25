"use client";

import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Flex, Input, Select, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { Ticket, TicketStatus, TicketType } from "@/services/api/tickets";
import { updateTicketStatus } from "@/services/api/tickets";
import { fetchAdminUsers, type AdminUser } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminTickets } from "./use-admin-tickets";

const statusOptions = [
    { label: "全部状态", value: "" },
    { label: "待处理", value: "open" },
    { label: "处理中", value: "in_progress" },
    { label: "已解决", value: "resolved" },
    { label: "已关闭", value: "closed" },
];

const typeOptions = [
    { label: "全部类型", value: "" },
    { label: "Bug", value: "bug" },
    { label: "功能建议", value: "feature" },
    { label: "问题反馈", value: "question" },
    { label: "其他", value: "other" },
];

const statusLabels: Record<TicketStatus, { text: string; color: string }> = {
    open: { text: "待处理", color: "orange" },
    in_progress: { text: "处理中", color: "blue" },
    resolved: { text: "已解决", color: "green" },
    closed: { text: "已关闭", color: "default" },
};

const typeLabels: Record<TicketType, string> = {
    bug: "Bug",
    feature: "功能建议",
    question: "问题反馈",
    other: "其他",
};

export default function AdminTicketsPage() {
    const router = useRouter();
    const { tickets, keyword, status, ticketType, page, pageSize, total, isLoading, searchTickets, changeStatus, changeType, changePage, changePageSize, resetFilters, refreshTickets } = useAdminTickets();
    const token = useUserStore((state) => state.token);
    const queryClient = useQueryClient();
    const [userMap, setUserMap] = useState<Map<string, AdminUser>>(new Map());
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;
        fetchAdminUsers(token, { pageSize: 500 }).then((res) => {
            const map = new Map<string, AdminUser>();
            res.items.forEach((u) => map.set(u.id, u));
            setUserMap(map);
        }).catch(() => {});
    }, [token]);
    const [keywordText, setKeywordText] = useState(keyword);

    useEffect(() => setKeywordText(keyword), [keyword]);

    const columns: ProColumns<Ticket>[] = [
        {
            title: "标题",
            dataIndex: "title",
            ellipsis: true,
            render: (_, item) => (
                <Typography.Link onClick={() => router.push(`/admin/tickets/${item.id}`)}>
                    {item.title}
                </Typography.Link>
            ),
        },
        {
            title: "提交者",
            dataIndex: "userId",
            width: 140,
            ellipsis: true,
            render: (_, item) => {
                const u = userMap.get(item.userId);
                return <Typography.Text>{u?.displayName || u?.username || item.userId.slice(0, 8)}</Typography.Text>;
            },
        },
        {
            title: "类型",
            dataIndex: "type",
            width: 100,
            render: (_, item) => <Tag>{typeLabels[item.type] || item.type}</Tag>,
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 110,
            render: (_, item) => {
                const s = statusLabels[item.status];
                return (
                    <Select
                        size="small"
                        variant="borderless"
                        value={item.status}
                        loading={updatingId === item.id}
                        style={{ minWidth: 80 }}
                        options={statusOptions.filter((o) => o.value !== "").map((o) => {
                            const sl = statusLabels[o.value as TicketStatus];
                            return { label: <Tag color={sl?.color}>{sl?.text}</Tag>, value: o.value };
                        })}
                        onChange={async (v) => {
                            setUpdatingId(item.id);
                            try {
                                await updateTicketStatus(token, item.id, v as TicketStatus);
                                await queryClient.invalidateQueries({ queryKey: ["admin", "tickets"] });
                            } catch {
                                // ignore
                            } finally {
                                setUpdatingId(null);
                            }
                        }}
                    />
                );
            },
        },
        {
            title: "指派",
            dataIndex: "assignedTo",
            width: 120,
            ellipsis: true,
            render: (_, item) => <Typography.Text type="secondary">{item.assignedTo || "-"}</Typography.Text>,
        },
        {
            title: "最后回复",
            dataIndex: "lastReplyAt",
            width: 170,
            render: (_, item) => (
                <Typography.Text type="secondary">
                    {item.lastReplyAt ? dayjs(item.lastReplyAt).format("YYYY-MM-DD HH:mm") : "-"}
                </Typography.Text>
            ),
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            width: 170,
            render: (_, item) => (
                <Typography.Text type="secondary">
                    {item.createdAt ? dayjs(item.createdAt).format("YYYY-MM-DD HH:mm") : "-"}
                </Typography.Text>
            ),
        },
        {
            title: "操作",
            key: "actions",
            width: 80,
            render: (_, item) => (
                <Button type="link" size="small" onClick={() => router.push(`/admin/tickets/${item.id}`)}>查看</Button>
            ),
        },
    ];

    return (
        <Flex vertical gap={16} style={{ padding: 24 }}>
            <Flex gap={12} wrap="wrap">
                <Input
                    placeholder="搜索标题"
                    value={keywordText}
                    onChange={(e) => setKeywordText(e.target.value)}
                    onPressEnter={() => searchTickets(keywordText)}
                    style={{ width: 240 }}
                    allowClear
                />
                <Select options={statusOptions} value={status} onChange={changeStatus} style={{ width: 130 }} />
                <Select options={typeOptions} value={ticketType} onChange={changeType} style={{ width: 130 }} />
                <Button onClick={resetFilters}>重置</Button>
            </Flex>
            <ProTable<Ticket>
                rowKey="id"
                columns={columns}
                dataSource={tickets}
                loading={isLoading}
                search={false}
                defaultSize="middle"
                tableLayout="fixed"
                cardProps={{ variant: "borderless" }}
                headerTitle={
                    <Space>
                        <Typography.Text strong>工单列表</Typography.Text>
                        <Tag>{total} 条</Tag>
                    </Space>
                }
                options={{ density: true, setting: true, reload: () => void refreshTickets() }}
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
    );
}