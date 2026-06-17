package repository

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// SaveRelease 保存版本更新。
func SaveRelease(r model.Release) (model.Release, error) {
	db, err := DB()
	if err != nil {
		return r, err
	}
	return r, db.Save(&r).Error
}

// ListReleases 分页查询版本更新（管理用）。
func ListReleases(q model.Query) ([]model.Release, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.Release{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("version LIKE ? OR title LIKE ? OR summary LIKE ?", like, like, like)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.Release
	err = tx.Order("release_date desc, created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}

// ListActiveReleases 查询所有启用的版本更新（前台用）。
func ListActiveReleases() ([]model.Release, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.Release
	err = db.Where("active = ?", true).Order("release_date desc, created_at desc").Find(&items).Error
	return items, err
}

// DeleteRelease 删除版本更新。
func DeleteRelease(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.Release{}, "id = ?", id).Error
}

// DeleteReleasesByID 批量删除版本更新。
func DeleteReleasesByID(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.Release{}, "id IN ?", ids).Error
}

// GetReleaseByID 根据 ID 查询版本更新。
func GetReleaseByID(id string) (model.Release, bool, error) {
	db, err := DB()
	if err != nil {
		return model.Release{}, false, err
	}
	var r model.Release
	err = db.Where("id = ?", id).First(&r).Error
	if err == gorm.ErrRecordNotFound {
		return model.Release{}, false, nil
	}
	return r, err == nil, err
}

// GetReleaseByVersion 根据版本号查询版本更新。
func GetReleaseByVersion(version string) (model.Release, bool, error) {
	db, err := DB()
	if err != nil {
		return model.Release{}, false, err
	}
	var r model.Release
	err = db.Where("version = ?", version).First(&r).Error
	if err == gorm.ErrRecordNotFound {
		return model.Release{}, false, nil
	}
	return r, err == nil, err
}
