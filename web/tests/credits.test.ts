import { expect, test } from "bun:test";

import { requestCreditCost } from "../src/constant/credits";
import { useConfigStore } from "../src/stores/use-config-store";

test("requestCreditCost resolves raw model through a unique public alias", () => {
    useConfigStore.setState({
        publicSettings: {
            modelChannel: {
                availableModels: ["创作A"],
                modelAliases: [{ model: "agnes-image-2.1-flash", displayName: "创作A" }],
                modelProtocols: [{ model: "创作A", protocol: "agnes" }],
                modelCosts: [{ model: "创作A", credits: 7 }],
                defaultModel: "",
                defaultImageModel: "创作A",
                defaultVideoModel: "",
                defaultTextModel: "",
                systemPrompt: "",
                allowCustomChannel: true,
            },
            auth: { allowRegister: true, linuxDo: { enabled: false } },
            billing: { rechargeUrl: "" },
        },
    });

    expect(requestCreditCost({ model: "agnes-image-2.1-flash", count: 2 })).toBe(14);
});
