package service

import (
	"strings"
	"testing"
)

func TestBuildReleaseAIPromptIncludesTemplateRules(t *testing.T) {
	prompt := buildReleaseAIPrompt("v1.2.3", "模型记录", "新增文本模型选择")

	for _, want := range []string{
		"只根据输入内容整理",
		"+ [新增] 内容",
		"+ [修复] 内容",
		"不要编造未提供的信息",
		"不要输出 Markdown 标题",
	} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q:\n%s", want, prompt)
		}
	}
}
