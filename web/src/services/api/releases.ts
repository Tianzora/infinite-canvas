import { apiGet } from "@/services/api/request";

export type PublicReleaseItem = {
    type: string;
    content: string;
};

export type PublicRelease = {
    version: string;
    date: string;
    items: PublicReleaseItem[];
};

export async function fetchPublicReleases() {
    return apiGet<PublicRelease[]>("/api/releases");
}
