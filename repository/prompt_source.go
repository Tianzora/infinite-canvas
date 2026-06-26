package repository

import (
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ListPromptSources 返回全部远程源。
func ListPromptSources() ([]model.PromptSource, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.PromptSource
	if err := db.Order("created_at asc").Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

// ListEnabledPromptSources 返回已启用的远程源。
func ListEnabledPromptSources() ([]model.PromptSource, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.PromptSource
	if err := db.Where("enabled = ?", true).Order("created_at asc").Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

// GetPromptSource 根据分类编码查询远程源。
func GetPromptSource(category string) (model.PromptSource, bool, error) {
	db, err := DB()
	if err != nil {
		return model.PromptSource{}, false, err
	}
	var item model.PromptSource
	err = db.Where("category = ?", category).First(&item).Error
	if err == gorm.ErrRecordNotFound {
		return model.PromptSource{}, false, nil
	}
	return item, err == nil, err
}

// SavePromptSource 新增或更新远程源。
func SavePromptSource(source model.PromptSource) error {
	db, err := DB()
	if err != nil {
		return err
	}
	source.UpdatedAt = time.Now().Format(time.RFC3339)
	if source.CreatedAt == "" {
		source.CreatedAt = source.UpdatedAt
	}
	return db.Clauses(clause.OnConflict{
		UpdateAll: true,
	}).Create(&source).Error
}

// DeletePromptSource 删除远程源及关联提示词。
func DeletePromptSource(category string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("category = ?", category).Delete(&model.Prompt{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.PromptSource{}, "category = ?", category).Error
	})
}

// UpdatePromptSourceSyncStatus 更新远程源同步状态。
func UpdatePromptSourceSyncStatus(category string, syncedAt string, count int) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Model(&model.PromptSource{}).Where("category = ?", category).
		Updates(map[string]any{"synced_at": syncedAt, "prompt_count": count, "updated_at": time.Now().Format(time.RFC3339)}).Error
}
