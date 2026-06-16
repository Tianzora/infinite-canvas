package service

import (
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

// ListActiveAnnouncements 获取前台公告。
func ListActiveAnnouncements() ([]model.Announcement, error) {
	return repository.ListActiveAnnouncements()
}

// ListAnnouncements 分页查询公告。
func ListAnnouncements(q model.Query) (model.AnnouncementList, error) {
	items, total, err := repository.ListAnnouncements(q)
	if err != nil {
		return model.AnnouncementList{}, err
	}
	return model.AnnouncementList{Items: items, Total: int(total)}, nil
}

// SaveAnnouncement 保存公告。
func SaveAnnouncement(a model.Announcement) (model.Announcement, error) {
	if strings.TrimSpace(a.Title) == "" {
		return model.Announcement{}, safeMessageError{message: "标题不能为空"}
	}
	if a.ID == "" {
		a.ID = newID("announcement")
		a.CreatedAt = now()
	}
	a.UpdatedAt = now()
	return repository.SaveAnnouncement(a)
}

// DeleteAnnouncement 删除公告。
func DeleteAnnouncement(id string) error {
	return repository.DeleteAnnouncement(id)
}
