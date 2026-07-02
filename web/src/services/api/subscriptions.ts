import { apiDelete, apiGet, apiPost, compactApiParams, type ApiParams } from "@/services/api/request";

export type SubscriptionPeriod = "monthly" | "quarterly" | "yearly";

export type SubscriptionPlan = {
    id: string;
    name: string;
    period: SubscriptionPeriod;
    dailyQuota: number;
    monthlyQuota: number;
    priceText: string;
    description: string;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};

export type UserSubscription = {
    id: string;
    userId: string;
    planId: string;
    plan: SubscriptionPlan;
    status: "active" | "canceled" | "expired";
    startsAt: string;
    endsAt: string;
    canceledAt: string;
    createdAt: string;
    updatedAt: string;
};

export type SubscriptionSummary = {
    subscription: UserSubscription;
    plan: SubscriptionPlan;
    todayUsed: number;
    todayLeft: number;
    monthUsed: number;
    monthLeft: number;
};

export type SubscriptionPlanListResponse = {
    items: SubscriptionPlan[];
    total: number;
};

export async function fetchSubscriptionPlans() {
    return apiGet<SubscriptionPlan[]>("/api/subscription/plans");
}

export async function fetchMySubscription(token: string) {
    return apiGet<SubscriptionSummary | null>("/api/subscription/me", undefined, token);
}

export async function fetchAdminSubscriptionPlans(token: string, query: ApiParams = {}) {
    return apiGet<SubscriptionPlanListResponse>("/api/admin/subscription-plans", compactApiParams(query), token);
}

export async function saveAdminSubscriptionPlan(token: string, plan: Partial<SubscriptionPlan>) {
    return apiPost<SubscriptionPlan>("/api/admin/subscription-plans", plan, token);
}

export async function disableAdminSubscriptionPlan(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/subscription-plans/${encodeURIComponent(id)}`, token);
}
