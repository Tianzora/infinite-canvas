"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { deleteAdminPromptSource, fetchAdminPromptSources, saveAdminPromptSource, syncAdminPromptCategory, type PromptSource } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export function useAdminPromptSources() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const clearSession = useUserStore((state) => state.clearSession);

    const sourcesQuery = useQuery({
        queryKey: ["admin", "prompt-sources", token],
        queryFn: () => fetchAdminPromptSources(token),
        enabled: Boolean(token),
        retry: false,
    });

    const saveMutation = useMutation({
        mutationFn: (source: Partial<PromptSource>) => saveAdminPromptSource(token, source),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-sources"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-categories"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompts"] });
            message.success("远程源已保存");
        },
        onError: (error) => {
            message.error(error instanceof Error ? error.message : "保存失败");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (category: string) => deleteAdminPromptSource(token, category),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-sources"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-categories"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompts"] });
            message.success("远程源已删除");
        },
        onError: (error) => {
            message.error(error instanceof Error ? error.message : "删除失败");
        },
    });

    const syncMutation = useMutation({
        mutationFn: (category: string) => syncAdminPromptCategory(token, category),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-sources"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-categories"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "prompts"] });
            message.success("同步完成");
        },
        onError: (error) => {
            message.error(error instanceof Error ? error.message : "同步失败");
        },
    });

    useEffect(() => {
        const error = sourcesQuery.error;
        if (!error) return;
        const errorMessage = error instanceof Error ? error.message : "读取远程源失败";
        message.error(errorMessage);
        if (errorMessage.includes("未登录") || errorMessage.includes("权限不足")) clearSession();
    }, [sourcesQuery.error, clearSession, message]);

    return {
        sources: sourcesQuery.data || [],
        isLoading: sourcesQuery.isFetching,
        isSaving: saveMutation.isPending,
        isSyncing: syncMutation.isPending,
        saveSource: (source: Partial<PromptSource>) => saveMutation.mutateAsync(source),
        deleteSource: (category: string) => deleteMutation.mutateAsync(category),
        syncSource: (category: string) => syncMutation.mutateAsync(category),
        refreshSources: () => sourcesQuery.refetch(),
    };
}
