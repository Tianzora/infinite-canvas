import { apiDelete, apiGet, apiPost, compactApiParams, type ApiParams } from "@/services/api/request";

export type AdminReleaseItem = {
    type: string;
    content: string;
};

export type AdminRelease = {
    id: string;
    version: string;
    title: string;
    releaseDate: string;
    items: AdminReleaseItem[];
    summary: string;
    source: "manual" | "ai_record";
    active: boolean;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
};

export type AdminReleaseListResponse = {
    items: AdminRelease[];
    total: number;
};

export type GenerateReleaseRequest = {
    version: string;
    title?: string;
    notes?: string;
    model?: string;
};

export async function fetchAdminReleases(token: string, query: ApiParams = {}) {
    return apiGet<AdminReleaseListResponse>("/api/admin/releases", compactApiParams(query), token);
}

export async function saveAdminRelease(token: string, item: Partial<AdminRelease>) {
    return apiPost<AdminRelease>("/api/admin/releases", item, token);
}

export async function deleteAdminRelease(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/releases/${encodeURIComponent(id)}`, token);
}

export async function deleteAdminReleases(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/releases/batch-delete", { ids }, token);
}

export async function generateAdminRelease(token: string, req: GenerateReleaseRequest) {
    return apiPost<AdminRelease>("/api/admin/releases/generate", req, token);
}
