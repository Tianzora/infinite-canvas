package service

import (
	"crypto/rand"
	"encoding/json"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const couponCodeChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const couponCodeLength = 8

type GenerateCouponsRequest struct {
	Type      model.CouponType `json:"type"`
	Credits   int              `json:"credits"`
	PlanID    string           `json:"planId"`
	ExpiresAt string           `json:"expiresAt"`
}

type RedeemCouponResult struct {
	Balance      int                        `json:"balance"`
	Subscription *model.SubscriptionSummary `json:"subscription,omitempty"`
}

type CouponRedeemPreview struct {
	Type                    model.CouponType `json:"type"`
	PlanName                string           `json:"planName,omitempty"`
	WillReplaceSubscription bool             `json:"willReplaceSubscription"`
}

// GenerateCoupons 批量生成兑换码。
func GenerateCoupons(count int, req GenerateCouponsRequest) ([]model.Coupon, error) {
	if count <= 0 || count > 100 {
		return nil, safeMessageError{message: "数量需在 1-100 之间"}
	}
	couponType := req.Type
	if couponType == "" {
		couponType = model.CouponTypeCredits
	}
	if couponType == model.CouponTypeCredits && req.Credits <= 0 {
		return nil, safeMessageError{message: "额度需大于 0"}
	}
	if couponType == model.CouponTypeSubscription {
		plan, ok, err := repository.GetSubscriptionPlanByID(strings.TrimSpace(req.PlanID))
		if err != nil {
			return nil, err
		}
		if !ok || !plan.IsActive {
			return nil, safeMessageError{message: "请选择启用的订阅套餐"}
		}
		req.Credits = 0
		req.PlanID = plan.ID
	}
	if couponType != model.CouponTypeCredits && couponType != model.CouponTypeSubscription {
		return nil, safeMessageError{message: "兑换码类型无效"}
	}
	coupons := make([]model.Coupon, 0, count)
	for i := 0; i < count; i++ {
		code, err := generateUniqueCode()
		if err != nil {
			return nil, err
		}
		coupons = append(coupons, model.Coupon{
			ID:        newID("coupon"),
			Code:      code,
			Type:      couponType,
			PlanID:    strings.TrimSpace(req.PlanID),
			Credits:   req.Credits,
			IsActive:  true,
			ExpiresAt: strings.TrimSpace(req.ExpiresAt),
			CreatedAt: now(),
		})
	}
	if err := repository.SaveCoupons(coupons); err != nil {
		return nil, err
	}
	return coupons, nil
}

// ListCoupons 分页查询兑换码。
func ListCoupons(q model.Query, status string) (model.CouponList, error) {
	items, total, err := repository.ListCoupons(q, status)
	if err != nil {
		return model.CouponList{}, err
	}
	return model.CouponList{Items: items, Total: int(total)}, nil
}

// RedeemCoupon 用户兑换码。
func RedeemCoupon(userID string, code string) (RedeemCouponResult, error) {
	code = strings.TrimSpace(strings.ToUpper(code))
	if code == "" {
		return RedeemCouponResult{}, safeMessageError{message: "请输入兑换码"}
	}
	coupon, ok, err := repository.GetCouponByCode(code)
	if err != nil {
		return RedeemCouponResult{}, err
	}
	if !ok {
		return RedeemCouponResult{}, safeMessageError{message: "兑换码不存在"}
	}
	if coupon.Type == "" || coupon.Type == model.CouponTypeCredits {
		return redeemCreditsCoupon(userID, code, coupon)
	}
	if coupon.Type == model.CouponTypeSubscription {
		return redeemSubscriptionCoupon(userID, code, coupon)
	}
	return RedeemCouponResult{}, safeMessageError{message: "兑换码类型无效"}
}

func PreviewCouponRedeem(userID string, code string) (CouponRedeemPreview, error) {
	code = strings.TrimSpace(strings.ToUpper(code))
	if code == "" {
		return CouponRedeemPreview{}, safeMessageError{message: "请输入兑换码"}
	}
	coupon, ok, err := repository.GetCouponByCode(code)
	if err != nil {
		return CouponRedeemPreview{}, err
	}
	if !ok {
		return CouponRedeemPreview{}, safeMessageError{message: "兑换码不存在"}
	}
	if coupon.Type == "" {
		coupon.Type = model.CouponTypeCredits
	}
	preview := CouponRedeemPreview{Type: coupon.Type}
	if coupon.Type != model.CouponTypeSubscription {
		return preview, nil
	}
	plan, ok, err := repository.GetSubscriptionPlanByID(coupon.PlanID)
	if err != nil {
		return CouponRedeemPreview{}, err
	}
	if ok {
		preview.PlanName = plan.Name
	}
	_, hasCurrent, err := repository.GetCurrentSubscription(userID, now())
	if err != nil {
		return CouponRedeemPreview{}, err
	}
	preview.WillReplaceSubscription = hasCurrent
	return preview, nil
}

func redeemCreditsCoupon(userID string, code string, coupon model.Coupon) (RedeemCouponResult, error) {
	ts := now()
	extra, _ := json.Marshal(map[string]string{"coupon": coupon.Code, "couponType": string(model.CouponTypeCredits)})
	_, user, err := repository.RedeemCreditsCoupon(code, userID, ts, model.CreditLog{
		ID:        newID("credit"),
		UserID:    userID,
		Type:      model.CreditLogTypeRedeem,
		Amount:    coupon.Credits,
		Remark:    "兑换码兑换",
		Extra:     string(extra),
		CreatedAt: ts,
	})
	if err != nil {
		return RedeemCouponResult{}, err
	}
	return RedeemCouponResult{Balance: user.Credits}, nil
}

func redeemSubscriptionCoupon(userID string, code string, coupon model.Coupon) (RedeemCouponResult, error) {
	sub, err := RedeemSubscriptionCoupon(userID, coupon)
	if err != nil {
		return RedeemCouponResult{}, err
	}
	ts := now()
	extra, _ := json.Marshal(map[string]string{"coupon": coupon.Code, "couponType": string(model.CouponTypeSubscription), "subscriptionId": sub.ID, "planId": sub.PlanID})
	_, _, err = repository.RedeemSubscriptionCoupon(code, userID, ts, sub, true, model.CreditLog{
		ID:        newID("credit"),
		UserID:    userID,
		Type:      model.CreditLogTypeRedeem,
		Amount:    0,
		Balance:   currentBalance(userID),
		Remark:    "兑换订阅",
		Extra:     string(extra),
		CreatedAt: ts,
	})
	if err != nil {
		return RedeemCouponResult{}, err
	}
	summary, _, err := GetCurrentSubscriptionSummary(userID)
	if err != nil {
		return RedeemCouponResult{}, err
	}
	return RedeemCouponResult{Balance: currentBalance(userID), Subscription: &summary}, nil
}

// DeleteCoupons 批量删除兑换码。
func DeleteCoupons(ids []string) error {
	if len(ids) == 0 {
		return safeMessageError{message: "请选择要删除的兑换码"}
	}
	return repository.DeleteCouponsByIDs(ids)
}
func generateUniqueCode() (string, error) {
	for i := 0; i < 20; i++ {
		code, err := randomCode()
		if err != nil {
			return "", err
		}
		_, ok, err := repository.GetCouponByCode(code)
		if err != nil {
			return "", err
		}
		if !ok {
			return code, nil
		}
	}
	return "", safeMessageError{message: "生成唯一码失败，请重试"}
}

func randomCode() (string, error) {
	buf := make([]byte, couponCodeLength)
	_, err := rand.Read(buf)
	if err != nil {
		return "", err
	}
	for i, b := range buf {
		buf[i] = couponCodeChars[int(b)%len(couponCodeChars)]
	}
	return string(buf), nil
}
