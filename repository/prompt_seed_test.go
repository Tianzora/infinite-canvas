package repository

import (
	"strings"
	"testing"
)

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
