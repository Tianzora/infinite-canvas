package model

import "encoding/json"

// PromptSource 提示词远程源配置。
type PromptSource struct {
	Category     string          `json:"category" gorm:"primaryKey"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	GithubURL    string          `json:"githubUrl"`
	SourceURL    string          `json:"sourceUrl"`
	TemplateType string          `json:"templateType"`
	ParseConfig  json.RawMessage `json:"parseConfig" gorm:"serializer:json"`
	ImageBaseURL string          `json:"imageBaseUrl"`
	Enabled      bool            `json:"enabled"`
	SyncedAt     string          `json:"syncedAt"`
	PromptCount  int             `json:"promptCount"`
	CreatedAt    string          `json:"createdAt"`
	UpdatedAt    string          `json:"updatedAt"`
}

// JSONParseConfig JSON 模板的解析配置。
type JSONParseConfig struct {
	DataPath    string   `json:"dataPath"`
	Title       string   `json:"title"`
	Prompt      string   `json:"prompt"`
	PromptCases string   `json:"promptCases"`
	Image       string   `json:"image"`
	ImageSuffix string   `json:"imageSuffix"`
	Category    string   `json:"category"`
	Tags        []string `json:"tags"`
	IDPrefix    string   `json:"idPrefix"`
}

// READMEParseConfig README 模板的解析配置。
type READMEParseConfig struct {
	SectionPrefix  string   `json:"sectionPrefix"`
	SubSection     string   `json:"subSection"`
	TitlePattern   string   `json:"titlePattern"`
	PromptPattern  string   `json:"promptPattern"`
	PromptIsInline bool     `json:"promptIsInline"`
	ImagePattern   string   `json:"imagePattern"`
	Tags           []string `json:"tags"`
	IDPrefix       string   `json:"idPrefix"`
}
