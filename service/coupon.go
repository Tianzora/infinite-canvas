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

// GenerateCoupons 批量生成兑换码。
func GenerateCoupons(count int, credits int, expiresAt string) ([]model.Coupon, error) {
	if count <= 0 || count > 100 {
		return nil, safeMessageError{message: "数量需在 1-100 之间"}
	}
	if credits <= 0 {
		return nil, safeMessageError{message: "额度需大于 0"}
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
			Credits:   credits,
			IsActive:  true,
			ExpiresAt: strings.TrimSpace(expiresAt),
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
func RedeemCoupon(userID string, code string) (int, error) {
	code = strings.TrimSpace(strings.ToUpper(code))
	if code == "" {
		return 0, safeMessageError{message: "请输入兑换码"}
	}
	coupon, ok, err := repository.GetCouponByCode(code)
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, safeMessageError{message: "兑换码不存在"}
	}
	coupon, ok, err = repository.RedeemCoupon(code, userID, now())
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, safeMessageError{message: "兑换失败"}
	}
	user, _, err := repository.RefundUserCredits(userID, coupon.Credits, now())
	if err != nil {
		return 0, err
	}
	extra, _ := json.Marshal(map[string]string{"coupon": coupon.Code})
	_, _ = repository.SaveCreditLog(model.CreditLog{
		ID:        newID("credit"),
		UserID:    userID,
		Type:      model.CreditLogTypeRedeem,
		Amount:    coupon.Credits,
		Balance:   user.Credits,
		Remark:    "兑换码兑换",
		Extra:     string(extra),
		CreatedAt: now(),
	})
	return user.Credits, nil
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
