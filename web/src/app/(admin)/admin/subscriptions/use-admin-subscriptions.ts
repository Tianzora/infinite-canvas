"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { disableAdminSubscriptionPlan, fetchAdminSubscriptionPlans, saveAdminSubscriptionPlan, type SubscriptionPlan } from "@/services/api/subscriptions";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

export function useAdminSubscriptions() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const clearSession = useUserStore((state) => state.clearSession);
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(defaultPageSize);

    const query = useQuery({
        queryKey: ["admin", "subscription-plans", token, keyword, page, pageSize],
        queryFn: () => fetchAdminSubscriptionPlans(token, { keyword, page, pageSize }),
        enabled: Boolean(token),
        retry: false,
    });

    const saveMutation = useMutation({
        mutationFn: (plan: Partial<SubscriptionPlan>) => saveAdminSubscriptionPlan(token, plan),
        onSuccess: async (_, plan) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "subscription-plans"] });
            message.success(plan.id ? "套餐已保存" : "套餐已创建");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "保存失败"),
    });

    const disableMutation = useMutation({
        mutationFn: (id: string) => disableAdminSubscriptionPlan(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "subscription-plans"] });
            message.success("套餐已停用");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "停用失败"),
    });

    useEffect(() => {
        if (query.isError) {
            const errorMessage = query.error instanceof Error ? query.error.message : "读取套餐失败";
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
        plans: data?.items || [],
        keyword,
        page,
        pageSize,
        total: data?.total || 0,
        isLoading: query.isFetching || saveMutation.isPending || disableMutation.isPending,
        searchPlans: (value = keyword) => updateFilters({ keyword: value }),
        changePage: (value: number) => updateFilters({ page: value }),
        changePageSize: (value: number) => updateFilters({ pageSize: value }),
        resetFilters: () => updateFilters({ keyword: "", page: 1, pageSize: defaultPageSize }),
        refreshPlans: () => query.refetch(),
        savePlan: (plan: Partial<SubscriptionPlan>) => saveMutation.mutateAsync(plan),
        disablePlan: (id: string) => disableMutation.mutateAsync(id),
    };
}
