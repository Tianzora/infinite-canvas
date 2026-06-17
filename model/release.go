package model

// ReleaseItem 版本更新条目。
type ReleaseItem struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

// Release 本地版本更新记录。
type Release struct {
	ID          string        `json:"id" gorm:"primaryKey"`
	Version     string        `json:"version" gorm:"uniqueIndex"`
	Title       string        `json:"title"`
	ReleaseDate string        `json:"releaseDate"`
	Items       []ReleaseItem `json:"items" gorm:"serializer:json"`
	Summary     string        `json:"summary" gorm:"type:text"`
	Source      string        `json:"source"`
	Active      bool          `json:"active"`
	CreatedBy   string        `json:"createdBy"`
	CreatedAt   string        `json:"createdAt"`
	UpdatedAt   string        `json:"updatedAt"`
}

// ReleaseList 版本更新分页结果。
type ReleaseList struct {
	Items []Release `json:"items"`
	Total int       `json:"total"`
}

// PublicRelease 前台版本更新。
type PublicRelease struct {
	Version string             `json:"version"`
	Date    string             `json:"date"`
	Items   []PublicReleaseItem `json:"items"`
}

// PublicReleaseItem 前台版本更新条目。
type PublicReleaseItem struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

// GenerateReleaseRequest AI 自动生成版本更新请求。
type GenerateReleaseRequest struct {
	Version string `json:"version"`
	Title   string `json:"title"`
	Notes   string `json:"notes"`
}
