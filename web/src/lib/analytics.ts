import { ANALYTICS_BAIDU_ID, ANALYTICS_GA4_ID } from "@/constant/env";

type Gtag = (...args: unknown[]) => void;

declare global {
    interface Window {
        dataLayer?: unknown[];
        gtag?: Gtag;
        _hmt?: unknown[][];
    }
}

let initialized = false;
const active = { ga4: false, baidu: false };

function appendScript(src: string) {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
}

export function initAnalytics() {
    if (initialized || typeof window === "undefined") return;
    initialized = true;

    if (ANALYTICS_GA4_ID) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = (...args) => window.dataLayer?.push(args);
        appendScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_GA4_ID)}`);
        window.gtag("js", new Date());
        window.gtag("config", ANALYTICS_GA4_ID, { send_page_view: false });
        active.ga4 = true;
    }

    if (ANALYTICS_BAIDU_ID) {
        window._hmt = window._hmt || [];
        appendScript(`https://hm.baidu.com/hm.js?${encodeURIComponent(ANALYTICS_BAIDU_ID)}`);
        active.baidu = true;
    }
}

export function trackPageview(path: string) {
    if (typeof window === "undefined") return;
    if (active.ga4 && window.gtag) window.gtag("event", "page_view", { page_path: path, page_location: window.location.href });
    if (active.baidu && window._hmt) window._hmt.push(["_trackPageview", path]);
}
