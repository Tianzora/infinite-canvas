package service

import (
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

// ListPromptSources 返回全部远程源。
func ListPromptSources() ([]model.PromptSource, error) {
	return repository.ListPromptSources()
}

// SavePromptSource 保存远程源（新增或更新）。
func SavePromptSource(source model.PromptSource) error {
	if source.Category == "" {
		return &ValidationError{Message: "分类编码不能为空"}
	}
	now := time.Now().Format(time.RFC3339)
	if existing, ok, _ := repository.GetPromptSource(source.Category); ok {
		if source.CreatedAt == "" {
			source.CreatedAt = existing.CreatedAt
		}
	}
	if source.CreatedAt == "" {
		source.CreatedAt = now
	}
	source.UpdatedAt = now
	return repository.SavePromptSource(source)
}

// DeletePromptSource 删除远程源及关联提示词。
func DeletePromptSource(category string) error {
	if category == "" {
		return &ValidationError{Message: "分类编码不能为空"}
	}
	return repository.DeletePromptSource(category)
}

// SyncPromptSource 同步单个远程源。
func SyncPromptSource(category string) ([]model.PromptCategory, error) {
	return SyncPromptCategory(category)
}

// ValidationError 业务校验错误。
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string {
	return e.Message
}
