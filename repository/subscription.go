package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SubscriptionQuotaConsumption struct {
	Subscription model.UserSubscription
	Usage        model.SubscriptionUsage
	Plan         model.SubscriptionPlan
	BalanceSpent int
}

func ListSubscriptionPlans(q model.Query, activeOnly bool) ([]model.SubscriptionPlan, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.SubscriptionPlan{})
	if activeOnly {
		tx = tx.Where("is_active = ?", true)
	}
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("name LIKE ? OR description LIKE ?", like, like)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var plans []model.SubscriptionPlan
	err = tx.Order("sort_order asc, created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&plans).Error
	return plans, total, err
}

func SaveSubscriptionPlan(plan model.SubscriptionPlan) (model.SubscriptionPlan, error) {
	db, err := DB()
	if err != nil {
		return plan, err
	}
	return plan, db.Save(&plan).Error
}

func GetSubscriptionPlanByID(id string) (model.SubscriptionPlan, bool, error) {
	db, err := DB()
	if err != nil {
		return model.SubscriptionPlan{}, false, err
	}
	var plan model.SubscriptionPlan
	err = db.Where("id = ?", id).First(&plan).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.SubscriptionPlan{}, false, nil
	}
	return plan, err == nil, err
}

func DisableSubscriptionPlan(id string, now string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Model(&model.SubscriptionPlan{}).Where("id = ?", id).Updates(map[string]any{"is_active": false, "updated_at": now}).Error
}

func GetCurrentSubscription(userID string, ts string) (model.UserSubscription, bool, error) {
	db, err := DB()
	if err != nil {
		return model.UserSubscription{}, false, err
	}
	var sub model.UserSubscription
	err = db.Preload("Plan").Where("user_id = ? AND status = ? AND ends_at > ?", userID, model.SubscriptionStatusActive, ts).Order("ends_at desc").First(&sub).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.UserSubscription{}, false, nil
	}
	return sub, err == nil, err
}

func SubscriptionUsageTotals(subscriptionID string, usageDate string, usageMonth string) (int, int, error) {
	db, err := DB()
	if err != nil {
		return 0, 0, err
	}
	var today int
	if err := db.Model(&model.SubscriptionUsage{}).Select("COALESCE(SUM(credits), 0)").Where("subscription_id = ? AND usage_date = ?", subscriptionID, usageDate).Scan(&today).Error; err != nil {
		return 0, 0, err
	}
	var month int
	if err := db.Model(&model.SubscriptionUsage{}).Select("COALESCE(SUM(credits), 0)").Where("subscription_id = ? AND usage_month = ?", subscriptionID, usageMonth).Scan(&month).Error; err != nil {
		return 0, 0, err
	}
	return today, month, nil
}

func RedeemCreditsCoupon(code string, userID string, ts string, log model.CreditLog) (model.Coupon, model.User, error) {
	db, err := DB()
	if err != nil {
		return model.Coupon{}, model.User{}, err
	}
	var coupon model.Coupon
	var user model.User
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := lockCoupon(tx, code, ts, &coupon); err != nil {
			return err
		}
		if coupon.Type != "" && coupon.Type != model.CouponTypeCredits {
			return &couponError{"兑换码类型不匹配"}
		}
		if err := tx.Model(&model.Coupon{}).Where("id = ?", coupon.ID).Updates(redeemedCouponValues(userID, ts)).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{"credits": gorm.Expr("credits + ?", coupon.Credits), "updated_at": ts}).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ?", userID).First(&user).Error; err != nil {
			return err
		}
		log.Balance = user.Credits
		return tx.Save(&log).Error
	})
	return coupon, user, err
}

func RedeemSubscriptionCoupon(code string, userID string, ts string, subscription model.UserSubscription, cancelOld bool, log model.CreditLog) (model.Coupon, model.UserSubscription, error) {
	db, err := DB()
	if err != nil {
		return model.Coupon{}, model.UserSubscription{}, err
	}
	var coupon model.Coupon
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := lockCoupon(tx, code, ts, &coupon); err != nil {
			return err
		}
		if coupon.Type != model.CouponTypeSubscription {
			return &couponError{"兑换码类型不匹配"}
		}
		var plan model.SubscriptionPlan
		if err := tx.Where("id = ? AND is_active = ?", coupon.PlanID, true).First(&plan).Error; err != nil {
			return err
		}
		if cancelOld {
			if err := tx.Model(&model.UserSubscription{}).Where("user_id = ? AND status = ? AND ends_at > ?", userID, model.SubscriptionStatusActive, ts).Updates(map[string]any{"status": model.SubscriptionStatusCanceled, "canceled_at": ts, "updated_at": ts}).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&model.Coupon{}).Where("id = ?", coupon.ID).Updates(redeemedCouponValues(userID, ts)).Error; err != nil {
			return err
		}
		if err := tx.Save(&subscription).Error; err != nil {
			return err
		}
		log.RelatedID = subscription.ID
		return tx.Save(&log).Error
	})
	if err != nil {
		return model.Coupon{}, model.UserSubscription{}, err
	}
	subscription.PlanID = coupon.PlanID
	return coupon, subscription, nil
}

func ConsumeSubscriptionQuota(userID string, credits int, ts string, usageDate string, usageMonth string, usageID string) (SubscriptionQuotaConsumption, bool, error) {
	db, err := DB()
	if err != nil {
		return SubscriptionQuotaConsumption{}, false, err
	}
	var result SubscriptionQuotaConsumption
	err = db.Transaction(func(tx *gorm.DB) error {
		var sub model.UserSubscription
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Plan").Where("user_id = ? AND status = ? AND ends_at > ?", userID, model.SubscriptionStatusActive, ts).Order("ends_at desc").First(&sub).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		var today int
		if err := tx.Model(&model.SubscriptionUsage{}).Select("COALESCE(SUM(credits), 0)").Where("subscription_id = ? AND usage_date = ?", sub.ID, usageDate).Scan(&today).Error; err != nil {
			return err
		}
		var month int
		if err := tx.Model(&model.SubscriptionUsage{}).Select("COALESCE(SUM(credits), 0)").Where("subscription_id = ? AND usage_month = ?", sub.ID, usageMonth).Scan(&month).Error; err != nil {
			return err
		}
		if today+credits > sub.Plan.DailyQuota || month+credits > sub.Plan.MonthlyQuota {
			return nil
		}
		usage := model.SubscriptionUsage{ID: usageID, UserID: userID, SubscriptionID: sub.ID, UsageDate: usageDate, UsageMonth: usageMonth, Credits: credits, CreatedAt: ts, UpdatedAt: ts}
		if err := tx.Create(&usage).Error; err != nil {
			return err
		}
		result = SubscriptionQuotaConsumption{Subscription: sub, Usage: usage, Plan: sub.Plan}
		return nil
	})
	return result, result.Subscription.ID != "", err
}

func ReserveCreditsWithSubscription(userID string, credits int, ts string, usageDate string, usageMonth string, usageID string) (SubscriptionQuotaConsumption, bool, error) {
	db, err := DB()
	if err != nil {
		return SubscriptionQuotaConsumption{}, false, err
	}
	if credits <= 0 {
		return SubscriptionQuotaConsumption{}, true, nil
	}
	var result SubscriptionQuotaConsumption
	err = db.Transaction(func(tx *gorm.DB) error {
		var sub model.UserSubscription
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Plan").Where("user_id = ? AND status = ? AND ends_at > ?", userID, model.SubscriptionStatusActive, ts).Order("ends_at desc").First(&sub).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		subscriptionCredits := 0
		if err == nil {
			var today int
			if err := tx.Model(&model.SubscriptionUsage{}).Select("COALESCE(SUM(credits), 0)").Where("subscription_id = ? AND usage_date = ?", sub.ID, usageDate).Scan(&today).Error; err != nil {
				return err
			}
			var month int
			if err := tx.Model(&model.SubscriptionUsage{}).Select("COALESCE(SUM(credits), 0)").Where("subscription_id = ? AND usage_month = ?", sub.ID, usageMonth).Scan(&month).Error; err != nil {
				return err
			}
			subscriptionCredits = minInt(credits, minInt(sub.Plan.DailyQuota-today, sub.Plan.MonthlyQuota-month))
			if subscriptionCredits > 0 {
				usage := model.SubscriptionUsage{ID: usageID, UserID: userID, SubscriptionID: sub.ID, UsageDate: usageDate, UsageMonth: usageMonth, Credits: subscriptionCredits, CreatedAt: ts, UpdatedAt: ts}
				if err := tx.Create(&usage).Error; err != nil {
					return err
				}
				result.Subscription = sub
				result.Usage = usage
				result.Plan = sub.Plan
			}
		}
		balanceCredits := credits - subscriptionCredits
		if balanceCredits <= 0 {
			return nil
		}
		update := tx.Model(&model.User{}).Where("id = ? AND credits >= ?", userID, balanceCredits).Updates(map[string]any{
			"credits":    gorm.Expr("credits - ?", balanceCredits),
			"updated_at": ts,
		})
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected == 0 {
			return errInsufficientCredits
		}
		result.BalanceSpent = balanceCredits
		return nil
	})
	if errors.Is(err, errInsufficientCredits) {
		return SubscriptionQuotaConsumption{}, false, nil
	}
	return result, err == nil, err
}

func RefundSubscriptionUsage(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.SubscriptionUsage{}, "id = ?", id).Error
}

func lockCoupon(tx *gorm.DB, code string, ts string, coupon *model.Coupon) error {
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ?", code).First(coupon).Error; err != nil {
		return err
	}
	if coupon.UsedBy != "" {
		return errCouponUsed
	}
	if !coupon.IsActive {
		return errCouponInactive
	}
	if coupon.ExpiresAt != "" && coupon.ExpiresAt < ts {
		return errCouponExpired
	}
	return nil
}

func redeemedCouponValues(userID string, ts string) map[string]any {
	return map[string]any{"used_by": userID, "used_at": ts, "is_active": false}
}

var errInsufficientCredits = errors.New("insufficient credits")

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}
