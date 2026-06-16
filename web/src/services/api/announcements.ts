import { apiDelete, apiGet, apiPost, compactApiParams, type ApiParams } from "@/services/api/request";

export type Announcement = {
    id: string;
    title: string;
    content: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
};

export type AnnouncementListResponse = {
    items: Announcement[];
    total: number;
};

export async function fetchAnnouncements() {
    return apiGet<Announcement[]>("/api/announcements");
}

export async function fetchAdminAnnouncements(token: string, query: ApiParams = {}) {
    return apiGet<AnnouncementListResponse>("/api/admin/announcements", compactApiParams(query), token);
}

export async function saveAdminAnnouncement(token: string, item: Partial<Announcement>) {
    return apiPost<Announcement>("/api/admin/announcements", item, token);
}

export async function deleteAdminAnnouncement(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/announcements/${encodeURIComponent(id)}`, token);
}
