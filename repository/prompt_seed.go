package repository

import (
	"encoding/json"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func seedPromptSources(db *gorm.DB) error {
	now := time.Now().Format(time.RFC3339)
	sources := defaultPromptSources(now)
	return db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "category"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"name", "description", "github_url", "source_url", "template_type", "parse_config", "image_base_url", "updated_at",
		}),
	}).Create(&sources).Error
}

func defaultPromptSources(now string) []model.PromptSource {
	bt := "`"
	return []model.PromptSource{
		{
			Category: "gpt-image-2-prompts", Name: "GPT Image 2 Prompts",
			Description:  "EvoLinkAI 的 GPT Image 2 案例提示词",
			GithubURL:    "https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts",
			SourceURL:    "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/data/ingested_tweets.json",
			TemplateType: "json",
			ParseConfig:  json.RawMessage(`{"dataPath": "records", "title": "title", "image": "image_dir", "imageSuffix": "/output.jpg", "category": "category", "idPrefix": "gpt-image-2"}`),
			ImageBaseURL: "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main",
			Enabled:      false, CreatedAt: now, UpdatedAt: now,
		},
		{
			Category: "awesome-gpt-image", Name: "Awesome GPT Image",
			Description:  "ZeroLu 的中文 GPT Image 提示词",
			GithubURL:    "https://github.com/ZeroLu/awesome-gpt-image",
			SourceURL:    "https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main/README.zh-CN.md",
			TemplateType: "readme",
			ParseConfig:  json.RawMessage(`{"sectionPrefix": "## ", "subSection": "### ", "titlePattern": "(?m)^###\\s+(.+)$", "promptPattern": "(?s)\\*\\*提示词:\\*\\*\\s*\\r?\\n\\s*` + bt + `{3}[\\w-]*\\r?\\n(.*?)\\r?\\n` + bt + `{3}", "tags": ["awesome"], "idPrefix": "awesome-gpt-image"}`),
			ImageBaseURL: "https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main",
			Enabled:      true, CreatedAt: now, UpdatedAt: now,
		},
		{
			Category: "awesome-gpt4o-image-prompts", Name: "Awesome GPT4o Image Prompts",
			Description:  "ImgEdify 的 GPT-4o 图像提示词",
			GithubURL:    "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts",
			SourceURL:    "https://raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main/README.zh-CN.md",
			TemplateType: "readme",
			ParseConfig:  json.RawMessage(`{"sectionPrefix": "### ", "titlePattern": "(?m)^###\\s+(.+)$", "promptPattern": "(?s)- \\*\\*提示词文本：\\*\\*\\s*` + bt + `(.*?)` + bt + `", "tags": ["gpt4o"], "idPrefix": "awesome-gpt4o-image-prompts"}`),
			ImageBaseURL: "https://raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main",
			Enabled:      true, CreatedAt: now, UpdatedAt: now,
		},
		{
			Category: "youmind-gpt-image-2", Name: "YouMind GPT Image 2",
			Description:  "YouMind OpenLab 的 GPT Image 2 中文提示词",
			GithubURL:    "https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
			SourceURL:    "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_zh.md",
			TemplateType: "readme",
			ParseConfig:  json.RawMessage(`{"sectionPrefix": "### No. ", "titlePattern": "(?m)^###\\s+No\\.\\s*\\d+:\\s*(.+)$", "promptPattern": "(?s)#### .*?提示词\\s*\\r?\\n\\s*` + bt + `{3}[\\w-]*\\r?\\n(.*?)\\r?\\n` + bt + `{3}", "imagePattern": "(?s)#### .*?生成图片.*?<img[^>]+src=\"([^\"]+)\"", "tags": ["gpt-image-2"], "idPrefix": "youmind-gpt-image-2"}`),
			ImageBaseURL: "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main",
			Enabled:      true, CreatedAt: now, UpdatedAt: now,
		},
		{
			Category: "youmind-nano-banana-pro", Name: "YouMind Nano Banana Pro",
			Description:  "YouMind OpenLab 的 Nano Banana Pro 中文提示词",
			GithubURL:    "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts",
			SourceURL:    "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main/README_zh.md",
			TemplateType: "readme",
			ParseConfig:  json.RawMessage(`{"sectionPrefix": "### No. ", "titlePattern": "(?m)^###\\s+No\\.\\s*\\d+:\\s*(.+)$", "promptPattern": "(?s)#### .*?提示词\\s*\\r?\\n\\s*` + bt + `{3}[\\w-]*\\r?\\n(.*?)\\r?\\n` + bt + `{3}", "imagePattern": "(?s)#### .*?生成图片.*?<img[^>]+src=\"([^\"]+)\"", "tags": ["nano-banana-pro"], "idPrefix": "youmind-nano-banana-pro"}`),
			ImageBaseURL: "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main",
			Enabled:      true, CreatedAt: now, UpdatedAt: now,
		},
		{
			Category: "davidwu-gpt-image2-prompts", Name: "awesome-gpt-image2-prompts",
			Description:  "davidwuw0811-boop 整理的 GPT Image 2 提示词",
			GithubURL:    "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts",
			SourceURL:    "https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main/prompts.json",
			TemplateType: "json",
			ParseConfig:  json.RawMessage(`{"title": "title_cn", "prompt": "prompt", "image": "image", "category": "category", "idPrefix": "davidwu-gpt-image2"}`),
			ImageBaseURL: "https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main",
			Enabled:      true, CreatedAt: now, UpdatedAt: now,
		},
	}
}

func cleanupDisabledSourcePrompts(db *gorm.DB) error {
	var sources []model.PromptSource
	if err := db.Where("enabled = ?", false).Find(&sources).Error; err != nil {
		return err
	}
	for _, s := range sources {
		db.Where("category = ?", s.Category).Delete(&model.Prompt{})
	}
	return nil
}
