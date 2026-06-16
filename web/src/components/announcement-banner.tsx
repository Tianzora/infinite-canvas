"use client";

import { Typography } from "antd";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchAnnouncements, type Announcement } from "@/services/api/announcements";

const DISMISSED_KEY = "announcement-banner-dismissed";

export function AnnouncementBanner() {
    const [items, setItems] = useState<Announcement[]>([]);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (sessionStorage.getItem(DISMISSED_KEY)) {
            setDismissed(true);
            return;
        }
        fetchAnnouncements()
            .then((data) => {
                if (data.length > 0) setItems(data);
            })
            .catch(() => {});
    }, []);

    if (dismissed || items.length === 0) return null;

    const first = items[0];
    const remaining = items.length - 1;

    const handleDismiss = () => {
        sessionStorage.setItem(DISMISSED_KEY, "1");
        setDismissed(true);
    };

    return (
        <div className="shrink-0 border-b border-stone-200 bg-stone-50 px-6 py-3 dark:border-stone-800 dark:bg-stone-900">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <Typography.Text strong>{first.title}</Typography.Text>
                    {first.content ? (
                        <Typography.Text type="secondary" className="ml-2">
                            {first.content}
                        </Typography.Text>
                    ) : null}
                    {remaining > 0 ? (
                        <Typography.Text type="secondary" className="ml-2">
                            还有 {remaining} 条公告
                        </Typography.Text>
                    ) : null}
                </div>
                <button type="button" className="shrink-0 text-stone-400 transition hover:text-stone-600 dark:hover:text-stone-200" onClick={handleDismiss} aria-label="关闭公告">
                    <X className="size-4" />
                </button>
            </div>
        </div>
    );
}
