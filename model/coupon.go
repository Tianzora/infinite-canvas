package model

type CouponType string

const (
	CouponTypeCredits      CouponType = "credits"
	CouponTypeSubscription CouponType = "subscription"
)

// Coupon 兑换码。
type Coupon struct {
	ID        string            `json:"id" gorm:"primaryKey"`
	Code      string            `json:"code" gorm:"uniqueIndex"`
	Type      CouponType        `json:"type"`
	PlanID    string            `json:"planId" gorm:"index"`
	Plan      *SubscriptionPlan `json:"plan,omitempty" gorm:"foreignKey:PlanID"`
	Credits   int               `json:"credits"`
	UsedBy    string            `json:"usedBy"`
	UsedAt    string            `json:"usedAt"`
	ExpiresAt string            `json:"expiresAt"`
	IsActive  bool              `json:"isActive"`
	CreatedAt string            `json:"createdAt"`
}

// CouponList 兑换码分页结果。
type CouponList struct {
	Items []Coupon `json:"items"`
	Total int      `json:"total"`
}
