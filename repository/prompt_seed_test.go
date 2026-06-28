package repository

import (
	"strings"
	"testing"
)

func TestDefaultPromptSourcesUseRealMarkdownBackticks(t *testing.T) {
	sources := defaultPromptSources("now")
	for _, source := range sources {
		if source.TemplateType != "readme" {
			continue
		}
		parseConfig := string(source.ParseConfig)
		if strings.Contains(parseConfig, "` + bt + `") {
			t.Fatalf("%s parse config contains literal bt placeholder: %s", source.Category, parseConfig)
		}
		if strings.Contains(parseConfig, "` + bt + `{3}") {
			t.Fatalf("%s parse config contains literal bt placeholder: %s", source.Category, parseConfig)
		}
		if !strings.Contains(parseConfig, "```") && !strings.Contains(parseConfig, "`") {
			t.Fatalf("%s parse config missing markdown backticks: %s", source.Category, parseConfig)
		}
	}
}

func TestDefaultPromptSourcesIncludesCurrentYouMindGPTImage2Config(t *testing.T) {
	sources := defaultPromptSources("now")
	var found bool
	for _, source := range sources {
		if source.Category != "youmind-gpt-image-2" {
			continue
		}
		found = true
		if source.GithubURL != "https://github.com/YouMind-OpenLab/awesome-gpt-image-2" {
			t.Fatalf("github url = %q", source.GithubURL)
		}
		if source.SourceURL != "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_zh.md" {
			t.Fatalf("source url = %q", source.SourceURL)
		}
		parseConfig := string(source.ParseConfig)
		for _, want := range []string{`"sectionPrefix": "### No. "`, `"imagePattern":`, `生成图片`, `<img`} {
			if !strings.Contains(parseConfig, want) {
				t.Fatalf("parse config missing %q: %s", want, parseConfig)
			}
		}
	}
	if !found {
		t.Fatal("youmind-gpt-image-2 source not found")
	}
}
