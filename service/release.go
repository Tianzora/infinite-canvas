package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

var releaseItemPattern = regexp.MustCompile(`^\+\s+\[(.+?)\]\s+(.+)$`)

// ListPublicReleases 获取前台版本更新。
func ListPublicReleases() ([]model.PublicRelease, error) {
	items, err := repository.ListActiveReleases()
	if err != nil {
		return nil, err
	}
	result := make([]model.PublicRelease, 0, len(items))
	for _, item := range items {
		publicItems := make([]model.PublicReleaseItem, 0, len(item.Items))
		for _, ri := range item.Items {
			publicItems = append(publicItems, model.PublicReleaseItem{Type: ri.Type, Content: ri.Content})
		}
		result = append(result, model.PublicRelease{
			Version: item.Version,
			Date:    item.ReleaseDate,
			Items:   publicItems,
		})
	}
	return result, nil
}

// ListReleases 分页查询版本更新。
func ListReleases(q model.Query) (model.ReleaseList, error) {
	items, total, err := repository.ListReleases(q)
	if err != nil {
		return model.ReleaseList{}, err
	}
	return model.ReleaseList{Items: items, Total: int(total)}, nil
}

// SaveRelease 保存版本更新。
func SaveRelease(r model.Release) (model.Release, error) {
	if strings.TrimSpace(r.Version) == "" {
		return model.Release{}, safeMessageError{message: "版本号不能为空"}
	}
	existing, found, err := repository.GetReleaseByVersion(strings.TrimSpace(r.Version))
	if err != nil {
		return model.Release{}, err
	}
	if found && existing.ID != r.ID {
		return model.Release{}, safeMessageError{message: "版本号已存在"}
	}
	if r.ID == "" {
		r.ID = newID("release")
		r.CreatedAt = now()
	}
	r.Version = strings.TrimSpace(r.Version)
	r.UpdatedAt = now()
	if r.Source == "" {
		r.Source = "manual"
	}
	return repository.SaveRelease(r)
}

// DeleteRelease 删除版本更新。
func DeleteRelease(id string) error {
	return repository.DeleteRelease(id)
}

// DeleteReleases 批量删除版本更新。
func DeleteReleases(ids []string) error {
	if len(ids) == 0 {
		return safeMessageError{message: "请选择要删除的版本记录"}
	}
	return repository.DeleteReleasesByID(ids)
}

// GenerateReleaseNote AI 自动生成版本更新记录。
func GenerateReleaseNote(req model.GenerateReleaseRequest) (model.Release, error) {
	if strings.TrimSpace(req.Version) == "" {
		return model.Release{}, safeMessageError{message: "版本号不能为空"}
	}
	items, err := generateReleaseItemsWithAI(req.Version, req.Title, req.Notes)
	if err != nil {
		return model.Release{}, err
	}
	if len(items) == 0 {
		return model.Release{}, safeMessageError{message: "AI 未生成有效的更新条目，请补充描述后重试"}
	}
	release := model.Release{
		ID:          newID("release"),
		Version:     strings.TrimSpace(req.Version),
		Title:       strings.TrimSpace(req.Title),
		ReleaseDate: time.Now().Format("2006-01-02"),
		Items:       items,
		Summary:     strings.TrimSpace(req.Notes),
		Source:      "ai_record",
		Active:      true,
		CreatedBy:   "admin",
		CreatedAt:   now(),
		UpdatedAt:   now(),
	}
	return repository.SaveRelease(release)
}

// ParseReleaseItemsFromAIOutput 从 AI 输出中解析版本更新条目。
func ParseReleaseItemsFromAIOutput(text string) []model.ReleaseItem {
	lines := strings.Split(text, "\n")
	var items []model.ReleaseItem
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		match := releaseItemPattern.FindStringSubmatch(line)
		if len(match) == 3 {
			items = append(items, model.ReleaseItem{
				Type:    strings.TrimSpace(match[1]),
				Content: strings.TrimSpace(match[2]),
			})
		}
	}
	return items
}

func generateReleaseItemsWithAI(version string, title string, notes string) ([]model.ReleaseItem, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return nil, err
	}
	normalized := normalizeSettings(settings)
	modelName := normalized.Public.ModelChannel.DefaultTextModel
	if modelName == "" {
		for _, m := range normalized.Public.ModelChannel.AvailableModels {
			if strings.TrimSpace(m) != "" {
				modelName = m
				break
			}
		}
	}
	if modelName == "" {
		return nil, safeMessageError{message: "未配置可用文本模型，请先在系统设置中配置模型渠道"}
	}
	channel, _, err := SelectModelChannel(modelName)
	if err != nil {
		return nil, safeMessageError{message: "未找到可用的模型渠道：" + err.Error()}
	}
	prompt := buildReleaseAIPrompt(version, title, notes)
	body, _ := json.Marshal(map[string]any{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": "你是一个版本更新记录助手。根据用户提供的版本信息，生成结构化的版本更新条目。每条必须以 \"+ [类型] 内容\" 的格式输出，类型只能是：新增、修复、调整、优化、文档。只输出更新条目，不要输出其他内容。"},
			{"role": "user", "content": prompt},
		},
		"temperature": 0.3,
	})
	request, err := http.NewRequest(http.MethodPost, BuildModelChannelURL(channel, "/chat/completions"), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := adminModelHTTPClient.Do(request)
	if err != nil {
		return nil, safeMessageError{message: "AI 接口请求失败：上游接口无响应或网络不可达"}
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		return nil, readAdminChannelError(responseBody, response.StatusCode, "AI 生成版本记录失败")
	}
	var payload struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return nil, safeMessageError{message: "AI 返回格式解析失败"}
	}
	if len(payload.Choices) == 0 {
		return nil, safeMessageError{message: "AI 未返回有效内容"}
	}
	content := strings.TrimSpace(payload.Choices[0].Message.Content)
	items := ParseReleaseItemsFromAIOutput(content)
	return items, nil
}

func buildReleaseAIPrompt(version string, title string, notes string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("请为以下版本生成更新记录：\n版本号：%s", version))
	if title != "" {
		b.WriteString(fmt.Sprintf("\n标题：%s", title))
	}
	if notes != "" {
		b.WriteString(fmt.Sprintf("\n变更说明：\n%s", notes))
	}
	b.WriteString("\n\n请按 \"+ [类型] 内容\" 格式输出每条更新。")
	return b.String()
}
