package service

import (
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
					Enabled: true,
					Models:  []string{"gpt-5.5", "agnes-image-2.1-flash"},
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
