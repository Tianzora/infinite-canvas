"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import {
    deleteAdminRelease,
    deleteAdminReleases,
    fetchAdminReleases,
    generateAdminRelease,
    saveAdminRelease,
    type AdminRelease,
    type GenerateReleaseRequest,
} from "@/services/api/admin-releases";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

export function useAdminReleases() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const clearSession = useUserStore((state) => state.clearSession);
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(defaultPageSize);

    const query = useQuery({
        queryKey: ["admin", "releases", token, keyword, page, pageSize],
        queryFn: () => fetchAdminReleases(token, { keyword, page, pageSize }),
        enabled: Boolean(token),
        retry: false,
    });

    const saveMutation = useMutation({
        mutationFn: (item: Partial<AdminRelease>) => saveAdminRelease(token, item),
        onSuccess: async (_, item) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "releases"] });
            message.success(item.id ? "版本记录已保存" : "版本记录已创建");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "保存失败"),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminRelease(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "releases"] });
            message.success("版本记录已删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "删除失败"),
    });

    const batchDeleteMutation = useMutation({
        mutationFn: (ids: string[]) => deleteAdminReleases(token, ids),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "releases"] });
            message.success("版本记录已删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "删除失败"),
    });

    const generateMutation = useMutation({
        mutationFn: (req: GenerateReleaseRequest) => generateAdminRelease(token, req),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "releases"] });
            message.success("AI 已生成版本记录");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "生成失败"),
    });

    useEffect(() => {
        if (query.isError) {
            const errorMessage = query.error instanceof Error ? query.error.message : "读取版本记录失败";
            message.error(errorMessage);
            if (errorMessage.includes("未登录") || errorMessage.includes("权限不足") || errorMessage.includes("登录状态无效")) clearSession();
        }
    }, [clearSession, message, query.error, query.isError]);

    const updateFilters = (next: Partial<{ keyword: string; page: number; pageSize: number }>) => {
        const queryState = { keyword, page, pageSize, ...next };
        if (next.keyword !== undefined || next.pageSize !== undefined) queryState.page = 1;
        setKeyword(queryState.keyword);
        setPage(queryState.page);
        setPageSize(queryState.pageSize);
    };

    const data = query.data;

    return {
        releases: data?.items || [],
        keyword,
        page,
        pageSize,
        total: data?.total || 0,
        isLoading: query.isFetching || saveMutation.isPending || deleteMutation.isPending,
        isGenerating: generateMutation.isPending,
        searchReleases: (value = keyword) => updateFilters({ keyword: value }),
        changePage: (value: number) => updateFilters({ page: value }),
        changePageSize: (value: number) => updateFilters({ pageSize: value }),
        resetFilters: () => updateFilters({ keyword: "", page: 1, pageSize: defaultPageSize }),
        refreshReleases: () => query.refetch(),
        saveRelease: (item: Partial<AdminRelease>) => saveMutation.mutateAsync(item),
        deleteRelease: (id: string) => deleteMutation.mutateAsync(id),
        batchDeleteReleases: (ids: string[]) => batchDeleteMutation.mutateAsync(ids),
        generateRelease: (req: GenerateReleaseRequest) => generateMutation.mutateAsync(req),
    };
}
