"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ProConfigProvider } from "@ant-design/pro-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import { ClientRootInit } from "@/components/layout/client-root-init";
import { getAntThemeConfig } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
});

export function AppProviders({ children }: { children: ReactNode }) {
    const preference = useThemeStore((state) => state.preference);
    const setResolvedTheme = useThemeStore((state) => state.setResolvedTheme);
    const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
    const theme = preference === "system" ? systemTheme : preference;
    const dark = theme === "dark";

    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const sync = () => setSystemTheme(media.matches ? "dark" : "light");
        sync();
        media.addEventListener("change", sync);
        return () => media.removeEventListener("change", sync);
    }, []);

    useEffect(() => {
        setResolvedTheme(theme);
    }, [setResolvedTheme, theme]);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.colorScheme = theme;
    }, [dark, theme]);

    return (
        <ConfigProvider locale={zhCN} theme={getAntThemeConfig(dark)}>
            <ProConfigProvider dark={dark}>
                <App>
                    <QueryClientProvider client={queryClient}>
                        <ClientRootInit>{children}</ClientRootInit>
                    </QueryClientProvider>
                </App>
            </ProConfigProvider>
        </ConfigProvider>
    );
}
