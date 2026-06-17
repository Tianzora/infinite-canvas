import { useCallback, useEffect, useState } from "react";
import { App } from "antd";

import { fetchPublicReleases, type PublicRelease } from "@/services/api/releases";

export function useLocalRelease() {
    const { message } = App.useApp();
    const [releases, setReleases] = useState<PublicRelease[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const fetchReleases = useCallback(async (showMessage = false) => {
        setLoading(true);
        try {
            const data = await fetchPublicReleases();
            setReleases(data);
            if (showMessage) message.success("已获取最新版本信息");
            return true;
        } catch {
            if (showMessage) message.error("获取版本信息失败");
            return false;
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => {
        void fetchReleases();
    }, [fetchReleases]);

    const openReleaseModal = useCallback(() => {
        setOpen(true);
        void fetchReleases();
    }, [fetchReleases]);

    return {
        open,
        setOpen,
        openReleaseModal,
        releases,
        loading,
        fetchReleases,
    };
}
