package model

import "time"

type SubscriptionPeriod string

const (
	SubscriptionPeriodMonthly   SubscriptionPeriod = "monthly"
	SubscriptionPeriodQuarterly SubscriptionPeriod = "quarterly"
	SubscriptionPeriodYearly    SubscriptionPeriod = "yearly"
)

type SubscriptionStatus string

const (
	SubscriptionStatusActive   SubscriptionStatus = "active"
	SubscriptionStatusCanceled SubscriptionStatus = "canceled"
	SubscriptionStatusExpired  SubscriptionStatus = "expired"
)

type SubscriptionPlan struct {
	ID           string             `json:"id" gorm:"primaryKey"`
	Name         string             `json:"name"`
	Period       SubscriptionPeriod `json:"period" gorm:"index"`
	DailyQuota   int                `json:"dailyQuota"`
	MonthlyQuota int                `json:"monthlyQuota"`
	PriceText    string             `json:"priceText"`
	Description  string             `json:"description" gorm:"type:text"`
	SortOrder    int                `json:"sortOrder"`
	IsActive     bool               `json:"isActive" gorm:"index"`
	CreatedAt    string             `json:"createdAt"`
	UpdatedAt    string             `json:"updatedAt"`
}

type UserSubscription struct {
	ID         string             `json:"id" gorm:"primaryKey"`
	UserID     string             `json:"userId" gorm:"index"`
	PlanID     string             `json:"planId" gorm:"index"`
	Plan       SubscriptionPlan   `json:"plan" gorm:"foreignKey:PlanID"`
	Status     SubscriptionStatus `json:"status" gorm:"index"`
	StartsAt   string             `json:"startsAt"`
	EndsAt     string             `json:"endsAt" gorm:"index"`
	CanceledAt string             `json:"canceledAt"`
	CreatedAt  string             `json:"createdAt"`
	UpdatedAt  string             `json:"updatedAt"`
}

func (s UserSubscription) EndsAtTime() time.Time {
	t, _ := time.Parse(time.RFC3339, s.EndsAt)
	return t
}

type SubscriptionUsage struct {
	ID             string `json:"id" gorm:"primaryKey"`
	UserID         string `json:"userId" gorm:"index"`
	SubscriptionID string `json:"subscriptionId" gorm:"index"`
	UsageDate      string `json:"usageDate" gorm:"index"`
	UsageMonth     string `json:"usageMonth" gorm:"index"`
	Credits        int    `json:"credits"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type SubscriptionPlanList struct {
	Items []SubscriptionPlan `json:"items"`
	Total int                `json:"total"`
}

type SubscriptionSummary struct {
	Subscription UserSubscription `json:"subscription"`
	Plan         SubscriptionPlan `json:"plan"`
	TodayUsed    int              `json:"todayUsed"`
	TodayLeft    int              `json:"todayLeft"`
	MonthUsed    int              `json:"monthUsed"`
	MonthLeft    int              `json:"monthLeft"`
}
