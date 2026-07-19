"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { initAnalytics, trackPageview } from "@/lib/analytics";

export function AnalyticsTracker() {
    const pathname = usePathname();

    useEffect(() => {
        initAnalytics();
        trackPageview(pathname || window.location.pathname);
    }, [pathname]);

    return null;
}
