"use client";

import type { CSSProperties } from "react";
import { Modal, Tag, Timeline } from "antd";
import { useVersionCheck } from "@/hooks/use-version-check";
import { useLocalRelease } from "@/hooks/use-local-release";
import { APP_VERSION } from "@/constant/env";
import type { PublicRelease } from "@/services/api/releases";

function getTagColor(type: string) {
    if (type === "新增") return "green";
    if (type === "修复") return "red";
    if (type === "调整") return "blue";
    if (type === "文档") return "purple";
    return "default";
}

function getReleaseTitle(version: string) {
    return version === "Unreleased" ? "未发布" : version;
}

type VersionReleaseModalProps = {
    className?: string;
    style?: CSSProperties;
    source?: "local" | "upstream";
};

export function VersionReleaseModal({ className, style, source = "local" }: VersionReleaseModalProps) {
    const upstream = useVersionCheck();
    const local = useLocalRelease();

    const isLocal = source === "local";
    const open = isLocal ? local.open : upstream.open;
    const setOpen = isLocal ? local.setOpen : upstream.setOpen;
    const openReleaseModal = isLocal ? local.openReleaseModal : upstream.openReleaseModal;
    const checking = isLocal ? local.loading : upstream.checking;
    const hasNewVersion = isLocal ? false : upstream.hasNewVersion;
    const checkLatestRelease = isLocal ? () => local.fetchReleases(true) : () => void upstream.checkLatestRelease(true);

    const localItems: PublicRelease[] = isLocal
        ? local.releases
        : [];
    const upstreamItems = isLocal ? [] : upstream.releases;
    const latestVersion = isLocal ? APP_VERSION : upstream.latestVersion;

    return (
        <>
            <button
                type="button"
                className={className || "shrink-0 cursor-pointer text-xs font-medium text-stone-500 transition hover:text-stone-950 dark:text-stone-400 dark:hover:text-white"}
                style={style}
                onClick={openReleaseModal}
                title={isLocal ? "查看版本更新" : "查看上游版本更新"}
            >
                <span className="relative inline-flex">
                    {APP_VERSION}
                    {hasNewVersion ? <span className="absolute -right-1.5 -top-1 size-1.5 rounded-full bg-green-500" /> : null}
                </span>
            </button>
            <Modal title={isLocal ? "版本更新" : "上游版本更新"} open={open} width={680} centered footer={null} onCancel={() => setOpen(false)}>
                <div className="mb-5 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="text-xs text-stone-500 dark:text-stone-400">当前版本</div>
                        <div className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">{APP_VERSION}</div>
                    </div>
                    {!isLocal ? (
                        <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-xs text-stone-500 dark:text-stone-400">最新版本</div>
                                <button
                                    type="button"
                                    className="cursor-pointer bg-transparent p-0 text-[11px] font-normal text-stone-400 underline-offset-2 transition hover:text-stone-700 hover:underline dark:text-stone-500 dark:hover:text-stone-300"
                                    onClick={checkLatestRelease}
                                >
                                    {checking ? "检查中..." : "检查更新"}
                                </button>
                            </div>
                            <div className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">{latestVersion}</div>
                        </div>
                    ) : (
                        <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-xs text-stone-500 dark:text-stone-400">更新记录</div>
                                <button
                                    type="button"
                                    className="cursor-pointer bg-transparent p-0 text-[11px] font-normal text-stone-400 underline-offset-2 transition hover:text-stone-700 hover:underline dark:text-stone-500 dark:hover:text-stone-300"
                                    onClick={checkLatestRelease}
                                >
                                    {checking ? "加载中..." : "刷新"}
                                </button>
                            </div>
                            <div className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">{localItems.length} 条记录</div>
                        </div>
                    )}
                </div>
                <div className="max-h-[56vh] overflow-y-auto pr-2">
                    <Timeline
                        items={(isLocal ? localItems : upstreamItems).map((release) => ({
                            content: (
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-stone-950 dark:text-stone-100">{getReleaseTitle(release.version)}</span>
                                        <span className="text-xs text-stone-500 dark:text-stone-400">{release.date}</span>
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            {!isLocal && release.version === latestVersion ? <Tag color="green">最新</Tag> : null}
                                            {release.version === APP_VERSION ? <Tag>当前</Tag> : null}
                                        </div>
                                    </div>
                                    <div className="mt-2 space-y-1.5">
                                        {release.items.map((item, index) => (
                                            <div key={`${release.version}-${index}`} className="flex items-start gap-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
                                                <Tag color={getTagColor(item.type)} className="m-0 mt-0.5 shrink-0 whitespace-nowrap">
                                                    {item.type}
                                                </Tag>
                                                <span className="min-w-0 flex-1">{item.content}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ),
                        }))}
                    />
                </div>
            </Modal>
        </>
    );
}
