package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

func TestFetchTextFallsBackToGitHubRawMirror(t *testing.T) {
	originalRaw := githubRawBase
	originalMirror := githubRawMirrorBase
	t.Cleanup(func() {
		githubRawBase = originalRaw
		githubRawMirrorBase = originalMirror
	})

	mirror := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/owner/repo/main/prompts.json" {
			t.Fatalf("mirror path = %q", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer mirror.Close()
	githubRawBase = "http://127.0.0.1:1"
	githubRawMirrorBase = mirror.URL

	got, err := fetchText("http://127.0.0.1:1/owner/repo/main/prompts.json")
	if err != nil {
		t.Fatalf("fetchText returned error: %v", err)
	}
	if got != `{"ok":true}` {
		t.Fatalf("fetchText = %q, want mirror body", got)
	}
}

func TestBuildFromREADMEParsesYouMindGeneratedImage(t *testing.T) {
	readme := `# Awesome GPT Image 2

### No. 1: VR 头显爆炸视图海报

![Language-EN](https://img.shields.io/badge/Language-EN-blue)

#### 📝 提示词

` + "```" + `
{"type":"产品爆炸视图海报"}
` + "```" + `

#### 🖼️ 生成图片

##### Image 1

<div align="center">
<img src="https://cms-assets.youmind.com/media/1776658772018_lukyfw_HGSUfldbIAEiMWZ.jpg" width="700" alt="VR 头显爆炸视图海报 - Image 1">
</div>
`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(readme))
	}))
	defer server.Close()

	items, err := buildFromREADME(model.PromptSource{
		Category:     "youmind-gpt-image-2",
		SourceURL:    server.URL + "/README_zh.md",
		TemplateType: "readme",
		ParseConfig: json.RawMessage(`{
			"sectionPrefix": "### No. ",
			"titlePattern": "(?m)^###\\s+No\\.\\s*\\d+:\\s*(.+)$",
			"promptPattern": "(?s)#### .*?提示词\\s*\\r?\\n\\s*` + "`" + `{3}[\\w-]*\\r?\\n(.*?)\\r?\\n` + "`" + `{3}",
			"imagePattern": "(?s)#### .*?生成图片.*?<img[^>]+src=\"([^\"]+)\"",
			"tags": ["gpt-image-2"],
			"idPrefix": "youmind-gpt-image-2"
		}`),
	})
	if err != nil {
		t.Fatalf("buildFromREADME returned error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items len = %d, want 1", len(items))
	}
	if items[0].CoverURL != "https://cms-assets.youmind.com/media/1776658772018_lukyfw_HGSUfldbIAEiMWZ.jpg" {
		t.Fatalf("cover = %q", items[0].CoverURL)
	}
	if items[0].Title != "VR 头显爆炸视图海报" {
		t.Fatalf("title = %q", items[0].Title)
	}
}

func TestCachePromptImagesDownloadsConcurrently(t *testing.T) {
	var inFlight int32
	var maxInFlight int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := atomic.AddInt32(&inFlight, 1)
		for {
			previous := atomic.LoadInt32(&maxInFlight)
			if current <= previous || atomic.CompareAndSwapInt32(&maxInFlight, previous, current) {
				break
			}
		}
		time.Sleep(50 * time.Millisecond)
		atomic.AddInt32(&inFlight, -1)
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write([]byte("jpg"))
	}))
	defer server.Close()

	items := make([]model.Prompt, 12)
	for i := range items {
		items[i] = model.Prompt{
			ID:       leftPad(i + 1),
			Title:    "title",
			Prompt:   "prompt",
			CoverURL: server.URL + "/" + leftPad(i+1) + ".jpg",
		}
	}
	started := time.Now()
	got := cachePromptImages("concurrent-test", items)
	if elapsed := time.Since(started); elapsed > 500*time.Millisecond {
		t.Fatalf("cachePromptImages took %s, want concurrent downloads", elapsed)
	}
	if atomic.LoadInt32(&maxInFlight) < 2 {
		t.Fatalf("max concurrent downloads = %d, want > 1", maxInFlight)
	}
	for _, item := range got {
		if item.CoverURL == "" || item.CoverURL[:len("/api/media/prompts/images/")] != "/api/media/prompts/images/" {
			t.Fatalf("cover url = %q, want local prompt image path", item.CoverURL)
		}
	}
}

func TestPromptSyncTryLockSkipsOverlappingRun(t *testing.T) {
	unlock, ok := tryLockPromptSync()
	if !ok {
		t.Fatal("first lock failed")
	}
	defer unlock()
	if secondUnlock, ok := tryLockPromptSync(); ok {
		secondUnlock()
		t.Fatal("second lock succeeded while first lock held")
	}
}

func TestPromptSyncTryLockReleases(t *testing.T) {
	unlock, ok := tryLockPromptSync()
	if !ok {
		t.Fatal("first lock failed")
	}
	unlock()
	secondUnlock, ok := tryLockPromptSync()
	if !ok {
		t.Fatal("lock did not release")
	}
	secondUnlock()
}

func TestNormalizePromptSyncSettingUpgradesLegacyDefaultCron(t *testing.T) {
	setting := normalizePromptSyncSetting(model.PromptSyncSetting{Cron: "*/5 * * * *"})
	if setting.Cron != "*/30 * * * *" {
		t.Fatalf("cron = %q, want 30 minute default", setting.Cron)
	}
}
