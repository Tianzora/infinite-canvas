"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { deleteCoupons, fetchAdminCoupons, generateCoupons, type GenerateCouponsParams } from "@/services/api/coupons";
import { fetchAdminSubscriptionPlans } from "@/services/api/subscriptions";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

export function useAdminCoupons() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const clearSession = useUserStore((state) => state.clearSession);
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(defaultPageSize);

    const query = useQuery({
        queryKey: ["admin", "coupons", token, keyword, status, page, pageSize],
        queryFn: () => fetchAdminCoupons(token, { keyword, status, page, pageSize }),
        enabled: Boolean(token),
        retry: false,
    });

    const planQuery = useQuery({
        queryKey: ["admin", "subscription-plans", token, "coupon-select"],
        queryFn: () => fetchAdminSubscriptionPlans(token, { page: 1, pageSize: 100 }),
        enabled: Boolean(token),
        retry: false,
    });

    const generateMutation = useMutation({
        mutationFn: (params: GenerateCouponsParams) => generateCoupons(token, params),
        onSuccess: async (coupons) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
            message.success(`已生成 ${coupons.length} 个兑换码`);
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "生成失败"),
    });

    const deleteCouponsMutation = useMutation({
        mutationFn: (ids: string[]) => deleteCoupons(token, ids),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
            message.success("兑换码已删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "删除失败"),
    });

    useEffect(() => {
        if (query.isError) {
            const errorMessage = query.error instanceof Error ? query.error.message : "读取兑换码失败";
            message.error(errorMessage);
            if (errorMessage.includes("未登录") || errorMessage.includes("权限不足") || errorMessage.includes("登录状态无效")) clearSession();
        }
    }, [clearSession, message, query.error, query.isError]);

    const updateFilters = (next: Partial<{ keyword: string; status: string; page: number; pageSize: number }>) => {
        const queryState = { keyword, status, page, pageSize, ...next };
        if (next.keyword !== undefined || next.status !== undefined || next.pageSize !== undefined) queryState.page = 1;
        setKeyword(queryState.keyword);
        setStatus(queryState.status);
        setPage(queryState.page);
        setPageSize(queryState.pageSize);
    };

    const data = query.data;

    return {
        coupons: data?.items || [],
        plans: planQuery.data?.items || [],
        keyword,
        status,
        page,
        pageSize,
        total: data?.total || 0,
        isLoading: query.isFetching || planQuery.isFetching || generateMutation.isPending || deleteCouponsMutation.isPending,
        searchCoupons: (value = keyword) => updateFilters({ keyword: value }),
        changeStatus: (value: string) => updateFilters({ status: value }),
        changePage: (value: number) => updateFilters({ page: value }),
        changePageSize: (value: number) => updateFilters({ pageSize: value }),
        resetFilters: () => updateFilters({ keyword: "", status: "", page: 1, pageSize: defaultPageSize }),
        refreshCoupons: () => query.refetch(),
        generateCoupons: (params: GenerateCouponsParams) => generateMutation.mutateAsync(params),
        deleteCoupons: (ids: string[]) => deleteCouponsMutation.mutateAsync(ids),
    };
}
