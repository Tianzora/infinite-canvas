"use client";

import { SendOutlined } from "@ant-design/icons";
import { Avatar, Button, Card, Flex, Input, Spin, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { useState } from "react";

import type { TicketStatus, TicketType } from "@/services/api/tickets";
import { useUserStore } from "@/stores/use-user-store";
import { useTicketDetail } from "./use-ticket-detail";

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

export default function TicketDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params.id;
    const user = useUserStore((state) => state.user);
    const { detail, isLoading, replying, submitReply, refresh } = useTicketDetail(id);
    const [replyContent, setReplyContent] = useState("");

    const handleSend = async () => {
        const content = replyContent.trim();
        if (!content) return;
        await submitReply(content);
        setReplyContent("");
    };

    if (isLoading) {
        return (
            <main style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
                <Spin />
            </main>
        );
    }

    if (!detail) {
        return (
            <main style={{ padding: 24, textAlign: "center" }}>
                <Typography.Text type="secondary">工单不存在或无权查看</Typography.Text>
            </main>
        );
    }

    const ticket = detail.ticket;
    const statusInfo = statusLabels[ticket.status];
    const isClosed = ticket.status === "closed";

    return (
        <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
            <Flex vertical gap={20}>
                {/* 工单头信息 */}
                <Card>
                    <Flex vertical gap={12}>
                        <Flex align="center" gap={12} wrap="wrap">
                            <Typography.Title level={4} style={{ margin: 0 }}>{ticket.title}</Typography.Title>
                            <Tag>{typeLabels[ticket.type] || ticket.type}</Tag>
                            <Tag color={statusInfo?.color}>{statusInfo?.text || ticket.status}</Tag>
                        </Flex>
                        <Typography.Text type="secondary">
                            创建于 {dayjs(ticket.createdAt).format("YYYY-MM-DD HH:mm")}
                        </Typography.Text>
                    </Flex>
                </Card>

                {/* 对话流 */}
                <Flex vertical gap={16}>
                    {detail.replies.map((reply) => {
                        const isMe = reply.userId === user?.id;
                        return (
                            <Flex key={reply.id} justify={isMe ? "flex-end" : "flex-start"}>
                                <div style={{ maxWidth: "80%" }}>
                                    <Flex align="center" gap={8} style={{ marginBottom: 4 }} justify={isMe ? "flex-end" : "flex-start"}>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                            {isMe ? "我" : (reply.isStaff ? "管理员" : "用户")}
                                        </Typography.Text>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                            {dayjs(reply.createdAt).format("YYYY-MM-DD HH:mm")}
                                        </Typography.Text>
                                    </Flex>
                                    <div
                                        style={{
                                            padding: "10px 14px",
                                            borderRadius: 12,
                                            background: isMe ? "#1677ff" : "#f0f0f0",
                                            color: isMe ? "#fff" : "#000",
                                        }}
                                    >
                                        <Typography.Text style={{ color: isMe ? "#fff" : undefined, whiteSpace: "pre-wrap" }}>
                                            {reply.content}
                                        </Typography.Text>
                                    </div>
                                </div>
                            </Flex>
                        );
                    })}
                </Flex>

                {/* 回复输入框 */}
                {isClosed ? (
                    <Card>
                        <Typography.Text type="secondary">此工单已关闭，如需继续沟通请新建工单。</Typography.Text>
                    </Card>
                ) : (
                    <Card>
                        <Flex gap={12} align="flex-end">
                            <Input.TextArea
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                placeholder="输入回复内容..."
                                rows={3}
                                maxLength={5000}
                                style={{ flex: 1 }}
                                onPressEnter={(e) => {
                                    if (e.ctrlKey || e.metaKey) {
                                        e.preventDefault();
                                        void handleSend();
                                    }
                                }}
                            />
                            <Button type="primary" icon={<SendOutlined />} loading={replying} onClick={() => void handleSend()} disabled={!replyContent.trim()}>
                                发送
                            </Button>
                        </Flex>
                        <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                            Ctrl+Enter 发送
                        </Typography.Text>
                    </Card>
                )}
            </Flex>
        </main>
    );
}
