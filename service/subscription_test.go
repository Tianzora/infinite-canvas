package service

import (
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestRedeemCreditsCouponStillAddsUserCredits(t *testing.T) {
	setupSubscriptionTestDB(t)
	user := registerSubscriptionTestUser(t)

	coupons, err := GenerateCoupons(1, GenerateCouponsRequest{Type: model.CouponTypeCredits, Credits: 12})
	if err != nil {
		t.Fatalf("generate coupon: %v", err)
	}
	result, err := RedeemCoupon(user.ID, coupons[0].Code)
	if err != nil {
		t.Fatalf("redeem coupon: %v", err)
	}
	if result.Balance != 12 {
		t.Fatalf("balance = %d, want 12", result.Balance)
	}
	if result.Subscription != nil {
		t.Fatalf("subscription = %#v, want nil", result.Subscription)
	}
}

func TestRedeemSubscriptionCouponCreatesSubscriptionWithoutAddingCredits(t *testing.T) {
	setupSubscriptionTestDB(t)
	user := registerSubscriptionTestUser(t)
	plan := saveSubscriptionTestPlan(t, "月卡", model.SubscriptionPeriodMonthly, 10, 100)

	coupons, err := GenerateCoupons(1, GenerateCouponsRequest{Type: model.CouponTypeSubscription, PlanID: plan.ID})
	if err != nil {
		t.Fatalf("generate coupon: %v", err)
	}
	result, err := RedeemCoupon(user.ID, coupons[0].Code)
	if err != nil {
		t.Fatalf("redeem coupon: %v", err)
	}
	if result.Balance != 0 {
		t.Fatalf("balance = %d, want 0", result.Balance)
	}
	if result.Subscription == nil || result.Subscription.Plan.ID != plan.ID {
		t.Fatalf("subscription = %#v, want plan %s", result.Subscription, plan.ID)
	}
}

func TestPreviewSubscriptionCouponWarnsWhenRedeemWouldReplaceCurrentSubscription(t *testing.T) {
	setupSubscriptionTestDB(t)
	user := registerSubscriptionTestUser(t)
	plan := saveSubscriptionTestPlan(t, "月卡", model.SubscriptionPeriodMonthly, 10, 100)
	redeemSubscriptionTestCoupon(t, user.ID, plan.ID)

	coupons, err := GenerateCoupons(1, GenerateCouponsRequest{Type: model.CouponTypeSubscription, PlanID: plan.ID})
	if err != nil {
		t.Fatalf("generate subscription coupon: %v", err)
	}
	preview, err := PreviewCouponRedeem(user.ID, coupons[0].Code)
	if err != nil {
		t.Fatalf("preview subscription coupon: %v", err)
	}
	if !preview.WillReplaceSubscription {
		t.Fatal("willReplaceSubscription = false, want true")
	}

	creditCoupons, err := GenerateCoupons(1, GenerateCouponsRequest{Type: model.CouponTypeCredits, Credits: 10})
	if err != nil {
		t.Fatalf("generate credits coupon: %v", err)
	}
	preview, err = PreviewCouponRedeem(user.ID, creditCoupons[0].Code)
	if err != nil {
		t.Fatalf("preview credits coupon: %v", err)
	}
	if preview.WillReplaceSubscription {
		t.Fatal("credits coupon warned replacement, want false")
	}
}

func TestListUsersIncludesCurrentSubscription(t *testing.T) {
	setupSubscriptionTestDB(t)
	user := registerSubscriptionTestUser(t)
	plan := saveSubscriptionTestPlan(t, "月卡", model.SubscriptionPeriodMonthly, 10, 100)
	redeemSubscriptionTestCoupon(t, user.ID, plan.ID)

	users, err := ListUsers(model.Query{Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("list users: %v", err)
	}
	for _, item := range users.Items {
		if item.ID != user.ID {
			continue
		}
		if item.Subscription == nil || item.Subscription.Plan.Name != plan.Name {
			t.Fatalf("subscription = %#v, want plan %s", item.Subscription, plan.Name)
		}
		return
	}
	t.Fatalf("user %s not found", user.ID)
}

func TestRedeemSameSubscriptionPlanReplacesCurrentSubscriptionAndResetsUsage(t *testing.T) {
	setupSubscriptionTestDB(t)
	user := registerSubscriptionTestUser(t)
	plan := saveSubscriptionTestPlan(t, "月卡", model.SubscriptionPeriodMonthly, 10, 100)

	first := redeemSubscriptionTestCoupon(t, user.ID, plan.ID)
	if _, err := ReserveUserCredits(user.ID, 6); err != nil {
		t.Fatalf("reserve: %v", err)
	}
	second := redeemSubscriptionTestCoupon(t, user.ID, plan.ID)
	if second.Subscription.Subscription.ID == first.Subscription.Subscription.ID {
		t.Fatalf("subscription id = %s, want replacement", second.Subscription.Subscription.ID)
	}
	if !second.Subscription.Subscription.EndsAtTime().Before(first.Subscription.Subscription.EndsAtTime().Add(24 * time.Hour)) {
		t.Fatalf("second endsAt = %s, first endsAt = %s, want reset from now instead of extension", second.Subscription.Subscription.EndsAt, first.Subscription.Subscription.EndsAt)
	}
	if second.Subscription.TodayUsed != 0 || second.Subscription.MonthUsed != 0 {
		t.Fatalf("usage = today %d month %d, want reset", second.Subscription.TodayUsed, second.Subscription.MonthUsed)
	}
}

func TestReserveCreditsUsesSubscriptionBeforeUserCredits(t *testing.T) {
	setupSubscriptionTestDB(t)
	user := registerSubscriptionTestUser(t)
	if _, err := AdjustUserCredits(user.ID, 50); err != nil {
		t.Fatalf("adjust credits: %v", err)
	}
	plan := saveSubscriptionTestPlan(t, "月卡", model.SubscriptionPeriodMonthly, 10, 100)
	redeemSubscriptionTestCoupon(t, user.ID, plan.ID)

	reservation, err := ReserveUserCredits(user.ID, 7)
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	if reservation.Source != CreditReservationSourceSubscription {
		t.Fatalf("source = %s, want subscription", reservation.Source)
	}
	saved, _, err := repository.GetUserByID(user.ID)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if saved.Credits != 50 {
		t.Fatalf("credits = %d, want 50", saved.Credits)
	}
}

func TestReserveCreditsUsesSubscriptionThenBalanceForRemainder(t *testing.T) {
	setupSubscriptionTestDB(t)
	user := registerSubscriptionTestUser(t)
	if _, err := AdjustUserCredits(user.ID, 50); err != nil {
		t.Fatalf("adjust credits: %v", err)
	}
	plan := saveSubscriptionTestPlan(t, "月卡", model.SubscriptionPeriodMonthly, 5, 100)
	redeemSubscriptionTestCoupon(t, user.ID, plan.ID)

	reservation, err := ReserveUserCredits(user.ID, 7)
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	if reservation.Source != CreditReservationSourceMixed {
		t.Fatalf("source = %s, want mixed", reservation.Source)
	}
	if reservation.SubscriptionCredits != 5 || reservation.BalanceCredits != 2 {
		t.Fatalf("subscription=%d balance=%d, want 5/2", reservation.SubscriptionCredits, reservation.BalanceCredits)
	}
	saved, _, err := repository.GetUserByID(user.ID)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if saved.Credits != 48 {
		t.Fatalf("credits = %d, want 48", saved.Credits)
	}
}

func TestReserveCreditsFailsWhenSubscriptionAndBalanceTogetherInsufficient(t *testing.T) {
	setupSubscriptionTestDB(t)
	user := registerSubscriptionTestUser(t)
	if _, err := AdjustUserCredits(user.ID, 1); err != nil {
		t.Fatalf("adjust credits: %v", err)
	}
	plan := saveSubscriptionTestPlan(t, "月卡", model.SubscriptionPeriodMonthly, 5, 100)
	redeemSubscriptionTestCoupon(t, user.ID, plan.ID)

	_, err := ReserveUserCredits(user.ID, 7)
	if err == nil {
		t.Fatal("reserve succeeded, want insufficient credits")
	}
	summary, ok, err := GetCurrentSubscriptionSummary(user.ID)
	if err != nil || !ok {
		t.Fatalf("summary: ok=%v err=%v", ok, err)
	}
	if summary.TodayUsed != 0 {
		t.Fatalf("today used = %d, want 0", summary.TodayUsed)
	}
	saved, _, err := repository.GetUserByID(user.ID)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if saved.Credits != 1 {
		t.Fatalf("credits = %d, want 1", saved.Credits)
	}
}

func setupSubscriptionTestDB(t *testing.T) {
	t.Helper()
	config.Cfg = config.Config{
		StorageDriver:  "sqlite",
		DatabaseDSN:    "file:" + url.QueryEscape(t.Name()) + "?mode=memory&cache=shared",
		JWTSecret:      "test-secret",
		JWTExpireHours: 1,
	}
	if _, err := repository.DB(); err != nil {
		t.Fatalf("db: %v", err)
	}
}

func registerSubscriptionTestUser(t *testing.T) model.AuthUser {
	t.Helper()
	session, err := Register(fmt.Sprintf("sub-user-%d", time.Now().UnixNano()), "secret")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	return session.User
}

func saveSubscriptionTestPlan(t *testing.T, name string, period model.SubscriptionPeriod, dailyQuota int, monthlyQuota int) model.SubscriptionPlan {
	t.Helper()
	plan, err := SaveSubscriptionPlan(model.SubscriptionPlan{
		Name:         name + "-" + fmt.Sprint(time.Now().UnixNano()),
		Period:       period,
		DailyQuota:   dailyQuota,
		MonthlyQuota: monthlyQuota,
		PriceText:    "测试",
		IsActive:     true,
	})
	if err != nil {
		t.Fatalf("save plan: %v", err)
	}
	return plan
}

func redeemSubscriptionTestCoupon(t *testing.T, userID string, planID string) RedeemCouponResult {
	t.Helper()
	coupons, err := GenerateCoupons(1, GenerateCouponsRequest{Type: model.CouponTypeSubscription, PlanID: planID})
	if err != nil {
		t.Fatalf("generate coupon: %v", err)
	}
	result, err := RedeemCoupon(userID, coupons[0].Code)
	if err != nil {
		t.Fatalf("redeem coupon: %v", err)
	}
	if result.Subscription == nil {
		t.Fatal("subscription is nil")
	}
	if strings.TrimSpace(result.Subscription.Subscription.EndsAt) == "" {
		t.Fatal("subscription endsAt is empty")
	}
	return result
}
