import type { ComponentProps } from "react";
import { Zap } from "lucide-react";

import { useConfigStore } from "@/stores/use-config-store";
import type { AdminPublicSettings } from "@/services/api/admin";

export function CreditSymbol({ className, ...props }: ComponentProps<"span">) {
    return (
        <span {...props} className={`inline-flex items-center justify-center ${className || ""}`}>
            <Zap className="size-[1em] fill-current" strokeWidth={2.4} />
        </span>
    );
}

export type ModelCreditCost = {
    model: string;
    credits: number;
};

function modelCreditCost(modelCosts: ModelCreditCost[] | undefined, model: string, aliases: AdminPublicSettings["modelChannel"]["modelAliases"] = []) {
    const requestModel = model.trim();
    const exact = modelCosts?.find((item) => item.model.trim() === requestModel);
    if (exact) return exact.credits;
    const rawCounts = aliasRawCounts(aliases);
    const rawRequest = resolveRawModelNameIfUnique(requestModel, aliases, rawCounts);
    const matched = modelCosts?.find((item) => {
        const costModel = item.model.trim();
        const rawCost = resolveRawModelNameIfUnique(costModel, aliases, rawCounts);
        return rawCost === rawRequest || rawCost === requestModel || rawRequest === costModel;
    });
    return matched?.credits || 0;
}

function aliasRawCounts(aliases: AdminPublicSettings["modelChannel"]["modelAliases"]) {
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    for (const item of aliases) {
        const rawModel = item.model.trim();
        const displayName = item.displayName.trim();
        if (!rawModel || !displayName) continue;
        const key = `${rawModel}|${displayName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        counts.set(rawModel, (counts.get(rawModel) || 0) + 1);
    }
    return counts;
}

function resolveRawModelNameIfUnique(model: string, aliases: AdminPublicSettings["modelChannel"]["modelAliases"], rawCounts: Map<string, number>) {
    const name = model.trim();
    const alias = aliases.find((item) => item.displayName.trim() === name && rawCounts.get(item.model.trim()) === 1);
    return alias?.model.trim() || name;
}

export function requestCreditCost(options: { model: string; count?: string | number }) {
    const modelChannel = useConfigStore.getState().publicSettings?.modelChannel;
    const modelCosts = modelChannel?.modelCosts;
    if (!modelCosts?.length) return 0;
    const count = Math.max(1, Math.floor(Math.abs(Number(options.count)) || 1));
    return modelCreditCost(modelCosts, options.model, modelChannel?.modelAliases) * count;
}
