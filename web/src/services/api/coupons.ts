import { apiGet, apiPost, compactApiParams, type ApiParams } from "@/services/api/request";

export type Coupon = {
    id: string;
    code: string;
    credits: number;
    usedBy: string;
    usedAt: string;
    expiresAt: string;
    isActive: boolean;
    createdAt: string;
};

export type CouponListResponse = {
    items: Coupon[];
    total: number;
};

export type GenerateCouponsParams = {
    count: number;
    credits: number;
    expiresAt?: string;
};

export async function fetchAdminCoupons(token: string, query: ApiParams = {}) {
    return apiGet<CouponListResponse>("/api/admin/coupons", compactApiParams(query), token);
}

export async function generateCoupons(token: string, params: GenerateCouponsParams) {
    return apiPost<Coupon[]>("/api/admin/coupons/generate", params, token);
}

export async function redeemCoupon(code: string, token: string) {
    return apiPost<{ balance: number }>("/api/coupons/redeem", { code }, token);
}

export async function deleteCoupons(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/coupons/batch-delete", { ids }, token);
}