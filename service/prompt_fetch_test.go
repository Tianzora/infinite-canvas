package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

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
