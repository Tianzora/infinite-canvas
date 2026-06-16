"use client";

import type { ReactNode } from "react";

import { AnnouncementBanner } from "@/components/announcement-banner";
import { AppTopNav } from "@/components/layout/app-top-nav";

export default function UserLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <AppTopNav />
            <AnnouncementBanner />
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
    );
}
