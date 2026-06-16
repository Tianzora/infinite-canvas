package repository

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// SaveAnnouncement 保存公告。
func SaveAnnouncement(a model.Announcement) (model.Announcement, error) {
	db, err := DB()
	if err != nil {
		return a, err
	}
	return a, db.Save(&a).Error
}

// ListAnnouncements 分页查询公告（管理用）。
func ListAnnouncements(q model.Query) ([]model.Announcement, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.Announcement{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("title LIKE ? OR content LIKE ?", like, like)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.Announcement
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}

// ListActiveAnnouncements 查询所有启用的公告（前台用）。
func ListActiveAnnouncements() ([]model.Announcement, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var items []model.Announcement
	err = db.Where("active = ?", true).Order("created_at desc").Find(&items).Error
	return items, err
}

// DeleteAnnouncement 删除公告。
func DeleteAnnouncement(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.Announcement{}, "id = ?", id).Error
}

// GetAnnouncementByID 根据 ID 查询公告。
func GetAnnouncementByID(id string) (model.Announcement, bool, error) {
	db, err := DB()
	if err != nil {
		return model.Announcement{}, false, err
	}
	var a model.Announcement
	err = db.Where("id = ?", id).First(&a).Error
	if err == gorm.ErrRecordNotFound {
		return model.Announcement{}, false, nil
	}
	return a, err == nil, err
}
