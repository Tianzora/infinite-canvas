"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Badge, Button, Empty, Modal, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { Bell } from "lucide-react";

import { AnnouncementContent } from "@/components/announcement-content";
import { cn } from "@/lib/utils";
import type { Announcement } from "@/services/api/announcements";
import { useAnnouncementNotices } from "@/hooks/use-announcement-notices";

type AnnouncementNoticeButtonProps = {
    userId?: string;
    className?: string;
    style?: CSSProperties;
};

function formatAnnouncementDate(value?: string) {
    return value ? dayjs(value).format("YY-MM-DD") : "";
}

function AnnouncementTitleLine({ item }: { item: Announcement }) {
    return (
        <div className="flex items-start justify-between gap-4 pr-8">
            <Typography.Text strong className="min-w-0 flex-1 break-words leading-5">
                {item.title}
            </Typography.Text>
            <Typography.Text type="secondary" className="shrink-0 text-xs leading-5 tabular-nums">
                {formatAnnouncementDate(item.updatedAt || item.createdAt)}
            </Typography.Text>
        </div>
    );
}

export function AnnouncementNoticeButton({ userId, className, style }: AnnouncementNoticeButtonProps) {
    const { items, popupItem, hasUnread, readsReady, markRead } = useAnnouncementNotices(userId);
    const [listOpen, setListOpen] = useState(false);
    const [popupOpen, setPopupOpen] = useState(false);
    const [activePopup, setActivePopup] = useState<Announcement | null>(null);

    useEffect(() => {
        if (!readsReady) return;
        if (!popupItem || activePopup?.id === popupItem.id) return;
        setActivePopup(popupItem);
        setPopupOpen(true);
    }, [activePopup?.id, popupItem, readsReady]);

    const closePopup = async () => {
        if (activePopup) await markRead([activePopup]);
        setPopupOpen(false);
        setActivePopup(null);
    };

    const openList = async () => {
        setListOpen(true);
        if (items.length) await markRead(items);
    };

    return (
        <>
            <Tooltip title="公告" placement="bottom">
                <Badge dot={hasUnread} size="small">
                    <button type="button" className={cn("inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4", className)} style={style} onClick={() => void openList()} aria-label="公告">
                        <Bell className="size-4" />
                    </button>
                </Badge>
            </Tooltip>
            <Modal title="公告" open={listOpen} onCancel={() => setListOpen(false)} footer={null} width={640} destroyOnHidden>
                {items.length ? (
                    <div className="divide-y divide-stone-200 dark:divide-stone-800">
                        {items.map((item) => (
                            <article key={item.id} className="py-4 first:pt-0 last:pb-0">
                                <AnnouncementTitleLine item={item} />
                                <Typography.Paragraph className="!mb-0 mt-2 whitespace-pre-wrap text-stone-700 dark:text-stone-300">
                                    <AnnouncementContent content={item.content} />
                                </Typography.Paragraph>
                            </article>
                        ))}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无公告" />
                )}
            </Modal>
            <Modal
                title={activePopup ? <AnnouncementTitleLine item={activePopup} /> : "公告"}
                open={popupOpen}
                onCancel={() => void closePopup()}
                footer={[
                    <Button key="ok" type="primary" onClick={() => void closePopup()}>
                        我知道了
                    </Button>,
                ]}
                width={640}
                destroyOnHidden
            >
                <Typography.Paragraph className="!mb-0 min-h-[160px] whitespace-pre-wrap break-words text-stone-700 dark:text-stone-300">
                    <AnnouncementContent content={activePopup?.content || ""} />
                </Typography.Paragraph>
            </Modal>
        </>
    );
}
