package service

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type CreditReservationSource string

const (
	CreditReservationSourceNone         CreditReservationSource = "none"
	CreditReservationSourceCredits      CreditReservationSource = "credits"
	CreditReservationSourceSubscription CreditReservationSource = "subscription"
	CreditReservationSourceMixed        CreditReservationSource = "mixed"
)

type CreditReservation struct {
	UserID              string
	Source              CreditReservationSource
	Credits             int
	BalanceCredits      int
	SubscriptionCredits int
	UsageID             string
	SubscriptionID      string
	PlanName            string
}

func ListSubscriptionPlans(q model.Query, activeOnly bool) (model.SubscriptionPlanList, error) {
	items, total, err := repository.ListSubscriptionPlans(q, activeOnly)
	if err != nil {
		return model.SubscriptionPlanList{}, err
	}
	return model.SubscriptionPlanList{Items: items, Total: int(total)}, nil
}

func SaveSubscriptionPlan(plan model.SubscriptionPlan) (model.SubscriptionPlan, error) {
	plan.Name = strings.TrimSpace(plan.Name)
	if plan.Name == "" {
		return plan, safeMessageError{message: "套餐名不能为空"}
	}
	if plan.Period == "" {
		plan.Period = model.SubscriptionPeriodMonthly
	}
	if plan.Period != model.SubscriptionPeriodMonthly && plan.Period != model.SubscriptionPeriodQuarterly && plan.Period != model.SubscriptionPeriodYearly {
		return plan, safeMessageError{message: "订阅周期无效"}
	}
	if plan.DailyQuota <= 0 || plan.MonthlyQuota <= 0 {
		return plan, safeMessageError{message: "额度需大于 0"}
	}
	if plan.MonthlyQuota < plan.DailyQuota {
		return plan, safeMessageError{message: "月额度不能小于每日额度"}
	}
	ts := now()
	if plan.ID == "" {
		plan.ID = newID("plan")
		plan.CreatedAt = ts
	} else if saved, ok, err := repository.GetSubscriptionPlanByID(plan.ID); err != nil {
		return plan, err
	} else if ok {
		plan.CreatedAt = saved.CreatedAt
	}
	plan.UpdatedAt = ts
	return repository.SaveSubscriptionPlan(plan)
}

func DisableSubscriptionPlan(id string) error {
	if strings.TrimSpace(id) == "" {
		return safeMessageError{message: "套餐不存在"}
	}
	return repository.DisableSubscriptionPlan(id, now())
}

func GetCurrentSubscriptionSummary(userID string) (model.SubscriptionSummary, bool, error) {
	ts := now()
	sub, ok, err := repository.GetCurrentSubscription(userID, ts)
	if err != nil || !ok {
		return model.SubscriptionSummary{}, ok, err
	}
	date, month := usageKeys(time.Now())
	today, monthly, err := repository.SubscriptionUsageTotals(sub.ID, date, month)
	if err != nil {
		return model.SubscriptionSummary{}, false, err
	}
	return subscriptionSummary(sub, today, monthly), true, nil
}

func RedeemSubscriptionCoupon(userID string, coupon model.Coupon) (model.UserSubscription, error) {
	plan, ok, err := repository.GetSubscriptionPlanByID(coupon.PlanID)
	if err != nil {
		return model.UserSubscription{}, err
	}
	if !ok || !plan.IsActive {
		return model.UserSubscription{}, safeMessageError{message: "订阅套餐不可用"}
	}
	nowTime := time.Now()
	start := nowTime
	if _, ok, err := repository.GetCurrentSubscription(userID, nowTime.Format(time.RFC3339)); err != nil {
		return model.UserSubscription{}, err
	} else if ok {
		start = nowTime
	}
	ends := addSubscriptionPeriod(start, plan.Period)
	return model.UserSubscription{
		ID:        newID("sub"),
		UserID:    userID,
		PlanID:    plan.ID,
		Plan:      plan,
		Status:    model.SubscriptionStatusActive,
		StartsAt:  start.Format(time.RFC3339),
		EndsAt:    ends.Format(time.RFC3339),
		CreatedAt: nowTime.Format(time.RFC3339),
		UpdatedAt: nowTime.Format(time.RFC3339),
	}, nil
}

func TryConsumeSubscriptionQuota(userID string, credits int) (CreditReservation, bool, error) {
	if credits <= 0 {
		return CreditReservation{Source: CreditReservationSourceNone}, true, nil
	}
	ts := time.Now()
	date, month := usageKeys(ts)
	usageID := newID("usage")
	result, ok, err := repository.ReserveCreditsWithSubscription(userID, credits, ts.Format(time.RFC3339), date, month, usageID)
	if err != nil || !ok {
		return CreditReservation{}, ok, err
	}
	source := CreditReservationSourceCredits
	if result.Usage.ID != "" && result.BalanceSpent > 0 {
		source = CreditReservationSourceMixed
	} else if result.Usage.ID != "" {
		source = CreditReservationSourceSubscription
	}
	return CreditReservation{
		UserID:              userID,
		Source:              source,
		Credits:             credits,
		BalanceCredits:      result.BalanceSpent,
		SubscriptionCredits: result.Usage.Credits,
		UsageID:             result.Usage.ID,
		SubscriptionID:      result.Subscription.ID,
		PlanName:            result.Plan.Name,
	}, true, nil
}

func RefundCreditReservation(reservation CreditReservation) error {
	if reservation.UsageID != "" {
		if err := repository.RefundSubscriptionUsage(reservation.UsageID); err != nil {
			return err
		}
	}
	if reservation.BalanceCredits > 0 || reservation.Source == CreditReservationSourceCredits {
		credits := reservation.BalanceCredits
		if credits == 0 {
			credits = reservation.Credits
		}
		_, ok, err := repository.RefundUserCredits(reservation.UserID, credits, now())
		if err != nil {
			return err
		}
		if !ok {
			return safeMessageError{message: "用户不存在"}
		}
	}
	return nil
}

func SaveSubscriptionConsumeLog(userID string, modelName string, rawModel string, channel string, credits int, path string, reservation CreditReservation) error {
	if credits <= 0 || reservation.SubscriptionCredits <= 0 {
		return nil
	}
	extra := map[string]string{"model": modelName, "rawModel": rawModel, "path": path, "subscriptionId": reservation.SubscriptionID, "planName": reservation.PlanName}
	if strings.TrimSpace(channel) != "" {
		extra["channel"] = strings.TrimSpace(channel)
	}
	payload, _ := json.Marshal(extra)
	_, err := repository.SaveCreditLog(model.CreditLog{
		ID:        newID("credit"),
		UserID:    userID,
		Type:      model.CreditLogTypeSubscriptionConsume,
		Amount:    -reservation.SubscriptionCredits,
		Balance:   currentBalance(userID),
		RelatedID: reservation.SubscriptionID,
		Remark:    "订阅额度调用模型 " + modelName,
		Extra:     string(payload),
		CreatedAt: now(),
	})
	return err
}

func subscriptionSummary(sub model.UserSubscription, today int, monthly int) model.SubscriptionSummary {
	return model.SubscriptionSummary{
		Subscription: sub,
		Plan:         sub.Plan,
		TodayUsed:    today,
		TodayLeft:    max(0, sub.Plan.DailyQuota-today),
		MonthUsed:    monthly,
		MonthLeft:    max(0, sub.Plan.MonthlyQuota-monthly),
	}
}

func addSubscriptionPeriod(t time.Time, period model.SubscriptionPeriod) time.Time {
	switch period {
	case model.SubscriptionPeriodQuarterly:
		return t.AddDate(0, 3, 0)
	case model.SubscriptionPeriodYearly:
		return t.AddDate(1, 0, 0)
	default:
		return t.AddDate(0, 1, 0)
	}
}

func usageKeys(t time.Time) (string, string) {
	return t.Format("2006-01-02"), t.Format("2006-01")
}

func currentBalance(userID string) int {
	user, ok, err := repository.GetUserByID(userID)
	if err != nil || !ok {
		return 0
	}
	return user.Credits
}
