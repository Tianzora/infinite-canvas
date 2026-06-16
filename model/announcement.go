package model

// Announcement 系统公告。
type Announcement struct {
	ID        string `json:"id" gorm:"primaryKey"`
	Title     string `json:"title"`
	Content   string `json:"content" gorm:"type:text"`
	Active    bool   `json:"active"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// AnnouncementList 公告分页结果。
type AnnouncementList struct {
	Items []Announcement `json:"items"`
	Total int            `json:"total"`
}
