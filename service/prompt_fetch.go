package service

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

var (
	githubRawBase       = "https://raw.githubusercontent.com"
	githubRawMirrorBase = "https://gh-proxy.com/https://raw.githubusercontent.com"
)

// SyncPromptCategory 同步指定分类的远程提示词。
func SyncPromptCategory(category string) ([]model.PromptCategory, error) {
	source, ok, err := repository.GetPromptSource(category)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("未知提示词分类")
	}
	items, err := buildPromptSource(source)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, errors.New("解析结果为空，保留已有数据")
	}
	items = cachePromptImages(source.Category, items)
	if err := repository.ReplacePromptCategory(model.PromptCategory{Category: source.Category, GithubURL: source.GithubURL}, items); err != nil {
		return nil, err
	}
	_ = repository.UpdatePromptSourceSyncStatus(source.Category, time.Now().Format(time.RFC3339), len(items))
	return repository.ListPromptCategories()
}

// buildPromptSource 根据远程源配置构建提示词列表。
func buildPromptSource(source model.PromptSource) ([]model.Prompt, error) {
	switch source.TemplateType {
	case "json":
		return buildFromJSON(source)
	case "readme":
		return buildFromREADME(source)
	default:
		return nil, errors.New("未知模板类型: " + source.TemplateType)
	}
}

// ── JSON 模板 ──

func buildFromJSON(source model.PromptSource) ([]model.Prompt, error) {
	var cfg model.JSONParseConfig
	if err := json.Unmarshal(source.ParseConfig, &cfg); err != nil {
		return nil, err
	}
	raw, err := fetchText(source.SourceURL)
	if err != nil {
		return nil, err
	}
	var root any
	if err := json.Unmarshal([]byte(raw), &root); err != nil {
		return nil, err
	}
	records := extractJSONArray(root, cfg.DataPath)
	idPrefix := cfg.IDPrefix
	if idPrefix == "" {
		idPrefix = source.Category
	}
	imageBase := source.ImageBaseURL
	if imageBase == "" {
		imageBase = baseURLFromPath(source.SourceURL)
	}
	var items []model.Prompt
	for i, rec := range records {
		obj, ok := rec.(map[string]any)
		if !ok {
			continue
		}
		title := stringField(obj, cfg.Title)
		prompt := resolvePromptField(obj, cfg.Prompt, cfg.PromptCases)
		if title == "" || prompt == "" {
			continue
		}
		image := ""
		if cfg.Image != "" {
			raw := stringField(obj, cfg.Image)
			if raw != "" {
				if cfg.ImageSuffix != "" {
					raw += cfg.ImageSuffix
				}
				image = absoluteImage(imageBase, raw)
			}
		}
		tags := cfg.Tags
		if cfg.Category != "" {
			if cat := stringField(obj, cfg.Category); cat != "" {
				tags = append(tags, splitTags(cat, "\\s*(&|and)\\s*")...)
			}
		}
		items = append(items, model.Prompt{
			ID:       idPrefix + "-" + leftPad(i+1),
			Title:    title,
			CoverURL: image,
			Prompt:   prompt,
			Tags:     tags,
			Preview:  markdownPreview([]string{image}),
		})
	}
	return items, nil
}

// resolvePromptField 支持 "cases[tweet_url]" 语法：从 obj 的 tweet_url 字段取值，
// 再从 obj 的 cases map 中查找对应提示词。
func resolvePromptField(obj map[string]any, promptField, casesField string) string {
	if promptField == "" {
		return ""
	}
	if strings.HasPrefix(promptField, "cases[") && strings.HasSuffix(promptField, "]") {
		keyField := promptField[6 : len(promptField)-1]
		key := stringField(obj, keyField)
		if key == "" {
			return ""
		}
		casesRaw, ok := obj[casesField]
		if !ok || casesField == "" {
			return ""
		}
		if casesMap, ok := casesRaw.(map[string]any); ok {
			if v, ok := casesMap[key].(string); ok {
				return v
			}
		}
		return ""
	}
	return stringField(obj, promptField)
}

func extractJSONArray(root any, dataPath string) []any {
	if dataPath == "" {
		if arr, ok := root.([]any); ok {
			return arr
		}
		return nil
	}
	parts := strings.Split(dataPath, ".")
	current := root
	for _, part := range parts {
		obj, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = obj[part]
	}
	if arr, ok := current.([]any); ok {
		return arr
	}
	return nil
}

func stringField(obj map[string]any, key string) string {
	if key == "" {
		return ""
	}
	v, ok := obj[key]
	if !ok {
		return ""
	}
	s, ok := v.(string)
	if ok {
		return s
	}
	// numeric → string
	switch n := v.(type) {
	case float64:
		return strconv.FormatFloat(n, 'f', -1, 64)
	case json.Number:
		return n.String()
	}
	return ""
}

// ── README 模板 ──

func buildFromREADME(source model.PromptSource) ([]model.Prompt, error) {
	var cfg model.READMEParseConfig
	if err := json.Unmarshal(source.ParseConfig, &cfg); err != nil {
		return nil, err
	}
	raw, err := fetchText(source.SourceURL)
	if err != nil {
		return nil, err
	}
	imageBase := source.ImageBaseURL
	if imageBase == "" {
		imageBase = baseURLFromPath(source.SourceURL)
	}
	idPrefix := cfg.IDPrefix
	if idPrefix == "" {
		idPrefix = source.Category
	}

	sections := splitByPrefix(raw, cfg.SectionPrefix)
	if cfg.SubSection != "" {
		var expanded []string
		for _, sec := range sections {
			subs := splitByPrefix(sec, cfg.SubSection)
			expanded = append(expanded, subs...)
		}
		sections = expanded
	}

	var items []model.Prompt
	for _, block := range sections {
		title := extractFirstMatch(block, cfg.TitlePattern)
		prompt := extractFirstMatch(block, cfg.PromptPattern)
		if cfg.PromptIsInline {
			prompt = extractInlinePrompt(block, cfg.PromptPattern)
		}
		title = strings.TrimSpace(title)
		prompt = strings.TrimSpace(prompt)
		if title == "" || prompt == "" {
			continue
		}
		images := extractBlockImages(imageBase, block, cfg.ImagePattern)
		cover := ""
		if len(images) > 0 {
			cover = images[0]
		}
		items = append(items, model.Prompt{
			ID:       idPrefix + "-" + leftPad(len(items)+1),
			Title:    title,
			CoverURL: cover,
			Prompt:   prompt,
			Tags:     cfg.Tags,
			Preview:  markdownPreview(images),
		})
	}
	return items, nil
}

func extractInlinePrompt(block, pattern string) string {
	re := regexp.MustCompile(pattern)
	match := re.FindStringSubmatch(block)
	if len(match) > 1 {
		return match[1]
	}
	return ""
}

// ── 通用工具 ──

// cachePromptImages 将提示词中的外部图片 URL 替换为本地缓存路径。
func cachePromptImages(category string, items []model.Prompt) []model.Prompt {
	for i := range items {
		if items[i].CoverURL != "" {
			if local, err := CachePromptImage(category, items[i].CoverURL); err == nil && local != "" {
				items[i].CoverURL = local
			}
		}
		if items[i].Preview != "" {
			re := regexp.MustCompile(`!\[\]\((https?://[^)]+)\)`)
			items[i].Preview = re.ReplaceAllStringFunc(items[i].Preview, func(match string) string {
				urls := re.FindStringSubmatch(match)
				if len(urls) < 2 {
					return match
				}
				if local, err := CachePromptImage(category, urls[1]); err == nil && local != "" {
					return "![](" + local + ")"
				}
				return match
			})
		}
	}
	return items
}

func fetchText(rawURL string) (string, error) {
	var lastErr error
	for _, targetURL := range promptFetchURLs(rawURL) {
		for attempt := 0; attempt < 3; attempt++ {
			request, _ := http.NewRequest(http.MethodGet, targetURL, nil)
			client := http.Client{Timeout: 60 * time.Second}
			response, err := client.Do(request)
			if err != nil {
				lastErr = err
				time.Sleep(time.Duration(attempt+1) * 2 * time.Second)
				continue
			}
			data, readErr := io.ReadAll(response.Body)
			_ = response.Body.Close()
			if response.StatusCode < 200 || response.StatusCode >= 300 {
				lastErr = errors.New("HTTP " + response.Status + " " + targetURL + " " + strings.TrimSpace(string(data[:min(len(data), 200)])))
				break
			}
			return string(data), readErr
		}
	}
	if lastErr == nil {
		lastErr = errors.New("unknown error")
	}
	return "", errors.New("拉取失败: " + rawURL + " (" + lastErr.Error() + ")")
}

func promptFetchURLs(rawURL string) []string {
	result := []string{rawURL}
	for _, mirror := range []string{os.Getenv("GITHUB_RAW_MIRROR_BASE"), githubRawMirrorBase} {
		if mirrorURL := githubRawMirrorURL(rawURL, mirror); mirrorURL != "" {
			result = append(result, mirrorURL)
		}
	}
	return uniqueStrings(result)
}

func githubRawMirrorURL(rawURL string, mirrorBase string) string {
	mirrorBase = strings.TrimRight(strings.TrimSpace(mirrorBase), "/")
	if mirrorBase == "" {
		return ""
	}
	rawPrefix := strings.TrimRight(githubRawBase, "/") + "/"
	if strings.HasPrefix(rawURL, rawPrefix) {
		return mirrorBase + "/" + strings.TrimPrefix(rawURL, rawPrefix)
	}
	return ""
}

func uniqueStrings(items []string) []string {
	result := []string{}
	seen := map[string]bool{}
	for _, item := range items {
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		result = append(result, item)
	}
	return result
}

func splitByPrefix(text, prefix string) []string {
	if prefix == "" {
		return []string{text}
	}
	blocks := []string{}
	lines := strings.Split(text, "\n")
	current := []string{}
	for _, line := range lines {
		if strings.HasPrefix(line, prefix) && len(current) > 0 {
			blocks = append(blocks, strings.Join(current, "\n"))
			current = []string{}
		}
		current = append(current, line)
	}
	if len(current) > 0 {
		blocks = append(blocks, strings.Join(current, "\n"))
	}
	return blocks
}

func extractFirstMatch(block, pattern string) string {
	if pattern == "" {
		return ""
	}
	match := regexp.MustCompile(pattern).FindStringSubmatch(block)
	if len(match) > 1 {
		return match[1]
	}
	return ""
}

func extractBlockImages(baseURL, block, pattern string) []string {
	seen := map[string]bool{}
	var images []string
	patterns := []string{`<img[^>]+src="([^"]+)"`, `!\[[^\]]*\]\(([^)]+)\)`}
	if pattern != "" {
		patterns = []string{pattern}
	}
	for _, p := range patterns {
		for _, match := range regexp.MustCompile(p).FindAllStringSubmatch(block, -1) {
			url := ""
			if len(match) > 1 {
				url = match[1]
			}
			if len(match) > 2 && match[2] != "" {
				url = match[2]
			}
			if url == "" {
				continue
			}
			url = absoluteImage(baseURL, url)
			if url != "" && !seen[url] {
				seen[url] = true
				images = append(images, url)
			}
		}
	}
	return images
}

func absoluteImage(baseURL, image string) string {
	if image == "" || strings.HasPrefix(image, "http://") || strings.HasPrefix(image, "https://") {
		return image
	}
	return strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(strings.TrimPrefix(image, "."), "/")
}

func baseURLFromPath(rawURL string) string {
	idx := strings.LastIndex(rawURL, "/")
	if idx < 0 {
		return rawURL
	}
	return rawURL[:idx]
}

func splitTags(value string, pattern string) []string {
	var tags []string
	for _, tag := range regexp.MustCompile(pattern).Split(value, -1) {
		if tag = strings.ToLower(strings.TrimSpace(tag)); tag != "" {
			tags = append(tags, tag)
		}
	}
	return tags
}

func markdownPreview(images []string) string {
	lines := []string{}
	for _, image := range images {
		if image != "" {
			lines = append(lines, "![]("+image+")")
		}
	}
	return strings.Join(lines, "\n\n")
}

func leftPad(value int) string {
	if value >= 1000 {
		return strconv.Itoa(value)
	}
	text := "000" + strconv.Itoa(value)
	return text[len(text)-3:]
}
