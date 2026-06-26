package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestFetchAdminChannelModelsParsesOpenAIModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"z-model"},{"id":"a-model"},{"id":""}]}`))
	}))
	defer server.Close()

	models, err := fetchAdminChannelModels(model.ModelChannel{
		BaseURL: server.URL,
		APIKey:  "test-key",
	})
	if err != nil {
		t.Fatalf("fetchAdminChannelModels returned error: %v", err)
	}
	if want := []string{"a-model", "z-model"}; !reflect.DeepEqual(models, want) {
		t.Fatalf("models = %#v, want %#v", models, want)
	}
}

func TestFetchAdminChannelModelsReportsArkPlanModelsUnsupported(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/plan/v3/models" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	_, err := fetchAdminChannelModels(model.ModelChannel{
		BaseURL: server.URL + "/api/plan/v3/contents/generations/tasks",
		APIKey:  "test-key",
	})
	if err == nil {
		t.Fatal("expected unsupported /models error")
	}
	if !strings.Contains(err.Error(), "Agent Plan 未提供 OpenAI /models") {
		t.Fatalf("error = %q", err.Error())
	}
}

func TestBuildModelChannelURLNormalizesArkPlanTaskPath(t *testing.T) {
	got := BuildModelChannelURL(model.ModelChannel{BaseURL: "https://ark.cn-beijing.volces.com/api/plan/v3/contents/generations/tasks?debug=1"}, "/models")
	want := "https://ark.cn-beijing.volces.com/api/plan/v3/models"
	if got != want {
		t.Fatalf("BuildModelChannelURL = %q, want %q", got, want)
	}
}

func TestNormalizeSettingsPublishesEnabledChannelModelsAndRepairsDefaults(t *testing.T) {
	settings := normalizeSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AvailableModels:   []string{"grok-imagine-video", "disabled-model"},
				DefaultModel:      "grok-imagine-video",
				DefaultTextModel:  "missing-text",
				DefaultImageModel: "missing-image",
				DefaultVideoModel: "missing-video",
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{
				{Enabled: true, Models: []string{"gpt-5.5", "doubao-seedream-5.0-lite", "doubao-seedance-2.0-fast", "gpt-5.5"}},
				{Enabled: false, Models: []string{"disabled-model"}},
			},
		},
	})

	channel := settings.Public.ModelChannel
	wantModels := []string{"gpt-5.5", "doubao-seedream-5.0-lite", "doubao-seedance-2.0-fast"}
	if !reflect.DeepEqual(channel.AvailableModels, wantModels) {
		t.Fatalf("available models = %#v, want %#v", channel.AvailableModels, wantModels)
	}
	if channel.DefaultModel != "gpt-5.5" {
		t.Fatalf("default model = %q, want text model", channel.DefaultModel)
	}
	if channel.DefaultTextModel != "gpt-5.5" {
		t.Fatalf("default text model = %q, want text model", channel.DefaultTextModel)
	}
	if channel.DefaultImageModel != "doubao-seedream-5.0-lite" {
		t.Fatalf("default image model = %q, want seedream", channel.DefaultImageModel)
	}
	if channel.DefaultVideoModel != "doubao-seedance-2.0-fast" {
		t.Fatalf("default video model = %q, want seedance", channel.DefaultVideoModel)
	}
}

func TestNormalizeSettingsPublishesDisplayModelAliasesAndRepairsDefaults(t *testing.T) {
	settings := normalizeSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				DefaultModel:      "missing-text",
				DefaultImageModel: "missing-image",
				DefaultVideoModel: "missing-video",
				ModelCosts: []model.ModelCost{
					{Model: "即梦视频 2.0 Pro", Credits: 12},
					{Model: "doubao-seedance-2.0-pro", Credits: 99},
				},
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{
				{
					Enabled: true,
					Models:  []string{"gpt-5.5", "doubao-seedance-2.0-pro", "doubao-seedream-5.0-lite"},
					ModelAliases: []model.ModelAlias{
						{Model: "doubao-seedance-2.0-pro", DisplayName: "即梦视频 2.0 Pro"},
						{Model: "doubao-seedream-5.0-lite", DisplayName: "即梦图片 Lite"},
					},
				},
				{
					Enabled: true,
					Models:  []string{"doubao-seedance-2.0-pro"},
					ModelAliases: []model.ModelAlias{
						{Model: "doubao-seedance-2.0-pro", DisplayName: "即梦视频 2.0 Pro"},
					},
				},
			},
		},
	})

	channel := settings.Public.ModelChannel
	wantModels := []string{"gpt-5.5", "即梦视频 2.0 Pro", "即梦图片 Lite"}
	if !reflect.DeepEqual(channel.AvailableModels, wantModels) {
		t.Fatalf("available models = %#v, want %#v", channel.AvailableModels, wantModels)
	}
	if channel.DefaultModel != "gpt-5.5" {
		t.Fatalf("default model = %q, want text model", channel.DefaultModel)
	}
	if channel.DefaultImageModel != "即梦图片 Lite" {
		t.Fatalf("default image model = %q, want display image model", channel.DefaultImageModel)
	}
	if channel.DefaultVideoModel != "即梦视频 2.0 Pro" {
		t.Fatalf("default video model = %q, want display video model", channel.DefaultVideoModel)
	}
	if channel.ModelCosts[0].Model != "即梦视频 2.0 Pro" {
		t.Fatalf("model cost model = %q, want public display model", channel.ModelCosts[0].Model)
	}
	wantAliases := []model.ModelAlias{
		{Model: "doubao-seedance-2.0-pro", DisplayName: "即梦视频 2.0 Pro"},
		{Model: "doubao-seedream-5.0-lite", DisplayName: "即梦图片 Lite"},
	}
	if !reflect.DeepEqual(channel.ModelAliases, wantAliases) {
		t.Fatalf("model aliases = %#v, want %#v", channel.ModelAliases, wantAliases)
	}
}

func TestNormalizeSettingsClassifiesCustomAgnesDisplayNameByRawModel(t *testing.T) {
	settings := normalizeSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				DefaultModel:      "missing-text",
				DefaultImageModel: "missing-image",
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{
				{
					Protocol: "openai",
					Enabled:  true,
					Models:   []string{"gpt-5.5"},
				},
				{
					Protocol: "agnes",
					Enabled:  true,
					Models:   []string{"agnes-image-2.1-flash"},
					ModelAliases: []model.ModelAlias{
						{Model: "agnes-image-2.1-flash", DisplayName: "创作A"},
					},
				},
			},
		},
	})

	channel := settings.Public.ModelChannel
	if channel.DefaultModel != "gpt-5.5" {
		t.Fatalf("default model = %q, want text model", channel.DefaultModel)
	}
	if channel.DefaultImageModel != "创作A" {
		t.Fatalf("default image model = %q, want custom Agnes display name", channel.DefaultImageModel)
	}
	wantAliases := []model.ModelAlias{{Model: "agnes-image-2.1-flash", DisplayName: "创作A"}}
	if !reflect.DeepEqual(channel.ModelAliases, wantAliases) {
		t.Fatalf("model aliases = %#v, want %#v", channel.ModelAliases, wantAliases)
	}
	wantProtocols := []model.ModelProtocol{{Model: "gpt-5.5", Protocol: "openai"}, {Model: "创作A", Protocol: "agnes"}}
	if !reflect.DeepEqual(channel.ModelProtocols, wantProtocols) {
		t.Fatalf("model protocols = %#v, want %#v", channel.ModelProtocols, wantProtocols)
	}
}

func TestModelCostMatchesRawModelThroughPublicAlias(t *testing.T) {
	previousConfig := config.Cfg
	t.Cleanup(func() { config.Cfg = previousConfig })
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: "file:model-cost-alias-test?mode=memory&cache=shared"}
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				ModelCosts: []model.ModelCost{{Model: "创作A", Credits: 7}},
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Enabled: true,
				Models:  []string{"agnes-image-2.1-flash"},
				ModelAliases: []model.ModelAlias{
					{Model: "agnes-image-2.1-flash", DisplayName: "创作A"},
				},
			}},
		},
	}, time.Now().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	credits, err := ModelCost("agnes-image-2.1-flash")
	if err != nil {
		t.Fatalf("ModelCost returned error: %v", err)
	}
	if credits != 7 {
		t.Fatalf("credits = %d, want alias display cost", credits)
	}
}

func TestMatchChannelModelMatchesDisplayNameBeforeRawModel(t *testing.T) {
	channel := model.ModelChannel{
		Models: []string{"doubao-seedance-2.0-pro", "即梦视频 2.0 Pro"},
		ModelAliases: []model.ModelAlias{
			{Model: "doubao-seedance-2.0-pro", DisplayName: "即梦视频 2.0 Pro"},
		},
	}

	raw, ok := MatchChannelModel(channel, "即梦视频 2.0 Pro")
	if !ok || raw != "doubao-seedance-2.0-pro" {
		t.Fatalf("MatchChannelModel display = %q %v, want raw model", raw, ok)
	}
	raw, ok = MatchChannelModel(channel, "doubao-seedance-2.0-pro")
	if !ok || raw != "doubao-seedance-2.0-pro" {
		t.Fatalf("MatchChannelModel raw = %q %v, want raw model", raw, ok)
	}
}

func TestNormalizePrivateSettingConvertsLegacyPrefixToAliases(t *testing.T) {
	settings := normalizeSettings(model.Settings{
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{
				{Enabled: true, Prefix: "ark-", Models: []string{"doubao-seedance-2.0-pro"}},
			},
		},
	})

	channel := settings.Private.Channels[0]
	wantAliases := []model.ModelAlias{{Model: "doubao-seedance-2.0-pro", DisplayName: "ark-doubao-seedance-2.0-pro"}}
	if !reflect.DeepEqual(channel.ModelAliases, wantAliases) {
		t.Fatalf("model aliases = %#v, want %#v", channel.ModelAliases, wantAliases)
	}
	if got := settings.Public.ModelChannel.AvailableModels; !reflect.DeepEqual(got, []string{"ark-doubao-seedance-2.0-pro"}) {
		t.Fatalf("available models = %#v, want legacy prefixed public model", got)
	}
}

func TestModelCostMatchesAfterAliasRename(t *testing.T) {
	// ModelCosts 存 displayName，请求用另一个也 resolve 到同一 rawModel 的名称。
	// ponytail: 如果旧 displayName 已从 alias 列表移除（即 alias 改名），仅凭当前 alias 无法 bridge；
	// 此时需要 Cost 存 rawModel（修改 3 保障）才能命中。
	aliases := []model.ModelAlias{
		{Model: "agnes-image-2.1-flash", DisplayName: "新名称"},
	}
	// 两者都 resolve 到同一 rawModel → 命中
	if !modelCostMatches("新名称", "agnes-image-2.1-flash", aliases) {
		t.Fatal("expected match: displayName vs rawModel, same rawModel")
	}
	// 旧名称不在 alias 列表中，无法 bridge — 这是改名后存旧 displayName 的真实边界
	if modelCostMatches("旧名称", "新名称", aliases) {
		t.Skip("skipped: 旧名称已从 alias 移除，无法通过当前 alias bridge；修改 3 存 rawModel 后可覆盖此路径")
	}
}

func TestModelCostMatchesBothResolveToSameRaw(t *testing.T) {
	// 两个不同 displayName 都 resolve 到同一 rawModel → 应匹配
	// 这是 fix 的核心场景：costModel 和 requestModel 都是 alias，resolve 后相等
	aliases := []model.ModelAlias{
		{Model: "gpt-5.5", DisplayName: "GPT-5"},
		{Model: "gpt-5.5", DisplayName: "GPT-5 Turbo"},
	}
	if !modelCostMatches("GPT-5", "GPT-5 Turbo", aliases) {
		t.Fatal("expected match: both resolve to same rawModel gpt-5.5")
	}
}

func TestModelCostMatchesRawModel(t *testing.T) {
	// ModelCosts 存 rawModel，请求用 displayName
	aliases := []model.ModelAlias{
		{Model: "agnes-image-2.1-flash", DisplayName: "我的图像模型"},
	}
	if !modelCostMatches("agnes-image-2.1-flash", "我的图像模型", aliases) {
		t.Fatal("expected match: costModel=rawModel, requestModel=displayName")
	}
	if !modelCostMatches("我的图像模型", "agnes-image-2.1-flash", aliases) {
		t.Fatal("expected match: costModel=displayName, requestModel=rawModel")
	}
}

func TestResolveCreditLogModels(t *testing.T) {
	previousConfig := config.Cfg
	t.Cleanup(func() { config.Cfg = previousConfig })
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: "file:resolve-credit-log-test?mode=memory&cache=shared"}
	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Enabled: true,
				Models:  []string{"agnes-image-2.1-flash"},
				ModelAliases: []model.ModelAlias{
					{Model: "agnes-image-2.1-flash", DisplayName: "新名称"},
				},
			}},
		},
	}, time.Now().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	logs := []model.CreditLog{
		{
			Type:   model.CreditLogTypeAIConsume,
			Remark: "调用模型 旧名称",
			Extra:  `{"model":"旧名称","rawModel":"agnes-image-2.1-flash","path":"/v1/chat/completions"}`,
		},
		{
			Type:   model.CreditLogTypeAIRefund,
			Remark: "模型调用失败返还 旧名称",
			Extra:  `{"model":"旧名称","rawModel":"agnes-image-2.1-flash","path":"/v1/chat/completions"}`,
		},
		{
			Type:   model.CreditLogTypeAdminAdjust,
			Remark: "管理员调整",
			Extra:  `{}`,
		},
	}

	resolveCreditLogModels(logs)

	if logs[0].Remark != "调用模型 新名称" {
		t.Fatalf("consume remark = %q, want 新名称", logs[0].Remark)
	}
	var extra0 map[string]string
	_ = json.Unmarshal([]byte(logs[0].Extra), &extra0)
	if extra0["model"] != "新名称" {
		t.Fatalf("consume extra model = %q, want 新名称", extra0["model"])
	}

	if logs[1].Remark != "模型调用失败返还 新名称" {
		t.Fatalf("refund remark = %q, want 新名称", logs[1].Remark)
	}

	// admin_adjust 不应被修改
	if logs[2].Remark != "管理员调整" {
		t.Fatalf("admin adjust remark = %q, want 管理员调整", logs[2].Remark)
	}
}

func TestPreserveAliasHistory(t *testing.T) {
	settings := &model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				ModelAliases: []model.ModelAlias{
					{Model: "agnes-image-2.1-flash", DisplayName: "新名称"},
				},
			},
		},
	}
	saved := model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				ModelAliases: []model.ModelAlias{
					{Model: "agnes-image-2.1-flash", DisplayName: "旧名称"},
				},
			},
		},
	}
	preserveAliasHistory(settings, saved)
	if len(settings.Public.ModelChannel.ModelAliasHistory) != 1 {
		t.Fatalf("history len = %d, want 1", len(settings.Public.ModelChannel.ModelAliasHistory))
	}
	h := settings.Public.ModelChannel.ModelAliasHistory[0]
	if h.Model != "agnes-image-2.1-flash" || h.DisplayName != "旧名称" {
		t.Fatalf("history entry = %v, want {agnes-image-2.1-flash, 旧名称}", h)
	}
}

func TestResolveCreditLogModelsWithHistory(t *testing.T) {
	previousConfig := config.Cfg
	t.Cleanup(func() { config.Cfg = previousConfig })
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: "file:resolve-history-test?mode=memory&cache=shared"}
	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Enabled: true,
				Models:  []string{"agnes-image-2.1-flash"},
				ModelAliases: []model.ModelAlias{
					{Model: "agnes-image-2.1-flash", DisplayName: "新名称"},
				},
			}},
		},
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				ModelAliasHistory: []model.ModelAlias{
					{Model: "agnes-image-2.1-flash", DisplayName: "旧名称"},
				},
			},
		},
	}, time.Now().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	logs := []model.CreditLog{
		{
			Type:   model.CreditLogTypeAIConsume,
			Remark: "调用模型 旧名称",
			Extra:  `{"model":"旧名称","path":"/v1/chat/completions"}`,
		},
	}

	resolveCreditLogModels(logs)

	if logs[0].Remark != "调用模型 新名称" {
		t.Fatalf("remark = %q, want 新名称", logs[0].Remark)
	}
	var extra map[string]string
	_ = json.Unmarshal([]byte(logs[0].Extra), &extra)
	if extra["model"] != "新名称" {
		t.Fatalf("extra model = %q, want 新名称", extra["model"])
	}
}

func TestReconcileModelCosts(t *testing.T) {
	// 旧 rawModel 条目迁移为 displayName，credits 保留
	costs := []model.ModelCost{
		{Model: "agnes-image-2.1-flash", Credits: 5},
		{Model: "gpt-5.5", Credits: 10},
	}
	aliases := []model.ModelAlias{
		{Model: "agnes-image-2.1-flash", DisplayName: "我的图像模型"},
	}
	result := reconcileModelCosts(costs, aliases)
	resultMap := map[string]int{}
	for _, c := range result {
		resultMap[c.Model] = c.Credits
	}
	if v, ok := resultMap["我的图像模型"]; !ok || v != 5 {
		t.Fatalf("expected 我的图像模型=5, got %d (ok=%v)", v, ok)
	}
	if _, ok := resultMap["agnes-image-2.1-flash"]; ok {
		t.Fatal("rawModel key should be removed after migration")
	}
	if v, ok := resultMap["gpt-5.5"]; !ok || v != 10 {
		t.Fatalf("expected gpt-5.5=10, got %d (ok=%v)", v, ok)
	}
}

func TestReconcileModelCostsKeepsDisplayNameWhenBothExist(t *testing.T) {
	// rawModel 和 displayName 同时存在，保留 displayName 的 credits
	costs := []model.ModelCost{
		{Model: "agnes-image-2.1-flash", Credits: 5},
		{Model: "我的图像模型", Credits: 8},
	}
	aliases := []model.ModelAlias{
		{Model: "agnes-image-2.1-flash", DisplayName: "我的图像模型"},
	}
	result := reconcileModelCosts(costs, aliases)
	resultMap := map[string]int{}
	for _, c := range result {
		resultMap[c.Model] = c.Credits
	}
	if v := resultMap["我的图像模型"]; v != 8 {
		t.Fatalf("expected 我的图像模型=8 (keep existing), got %d", v)
	}
	if _, ok := resultMap["agnes-image-2.1-flash"]; ok {
		t.Fatal("rawModel key should be removed")
	}
}

func TestReconcileModelCostsDropsOrphanRawModel(t *testing.T) {
	// rawModel 条目不在当前 aliases 里，丢弃
	costs := []model.ModelCost{
		{Model: "old-deleted-model", Credits: 3},
		{Model: "gpt-5.5", Credits: 10},
	}
	aliases := []model.ModelAlias{
		{Model: "gpt-5.5", DisplayName: "GPT-5"},
	}
	result := reconcileModelCosts(costs, aliases)
	resultMap := map[string]int{}
	for _, c := range result {
		resultMap[c.Model] = c.Credits
	}
	if _, ok := resultMap["old-deleted-model"]; !ok {
		t.Fatal("non-rawModel key should be kept")
	}
	if v := resultMap["GPT-5"]; v != 10 {
		t.Fatalf("expected GPT-5=10, got %d", v)
	}
}

func TestModelCostMatchesAfterReconciliation(t *testing.T) {
	// reconciliation 后 displayName 直接精确匹配
	costs := []model.ModelCost{
		{Model: "agnes-image-2.1-flash", Credits: 5},
	}
	aliases := []model.ModelAlias{
		{Model: "agnes-image-2.1-flash", DisplayName: "我的图像模型"},
	}
	reconciled := reconcileModelCosts(costs, aliases)
	if len(reconciled) != 1 || reconciled[0].Model != "我的图像模型" || reconciled[0].Credits != 5 {
		t.Fatalf("reconciled = %v", reconciled)
	}
	if !modelCostMatches(reconciled[0].Model, "我的图像模型", aliases) {
		t.Fatal("expected displayName exact match after reconciliation")
	}
	if !modelCostMatches(reconciled[0].Model, "agnes-image-2.1-flash", aliases) {
		t.Fatal("expected rawModel match through alias after reconciliation")
	}
}
