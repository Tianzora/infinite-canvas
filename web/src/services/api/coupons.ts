import { apiGet, apiPost, compactApiParams, type ApiParams } from "@/services/api/request";
import type { SubscriptionPlan, SubscriptionSummary } from "@/services/api/subscriptions";

export type Coupon = {
    id: string;
    code: string;
    type: "credits" | "subscription" | "";
    planId: string;
    plan?: SubscriptionPlan;
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
    type: "credits" | "subscription";
    planId?: string;
    credits: number;
    expiresAt?: string;
};

export type CouponRedeemPreview = {
    type: "credits" | "subscription" | "";
    planName?: string;
    willReplaceSubscription: boolean;
};

export async function fetchAdminCoupons(token: string, query: ApiParams = {}) {
    return apiGet<CouponListResponse>("/api/admin/coupons", compactApiParams(query), token);
}

export async function generateCoupons(token: string, params: GenerateCouponsParams) {
    return apiPost<Coupon[]>("/api/admin/coupons/generate", params, token);
}

export async function redeemCoupon(code: string, token: string) {
    return apiPost<{ balance: number; subscription?: SubscriptionSummary }>("/api/coupons/redeem", { code }, token);
}

export async function previewCouponRedeem(code: string, token: string) {
    return apiPost<CouponRedeemPreview>("/api/coupons/preview", { code }, token);
}

export async function deleteCoupons(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/coupons/batch-delete", { ids }, token);
}
