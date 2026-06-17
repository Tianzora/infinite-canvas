package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

type generateCouponsRequest struct {
	Count     int    `json:"count"`
	Credits   int    `json:"credits"`
	ExpiresAt string `json:"expiresAt"`
}

type redeemCouponRequest struct {
	Code string `json:"code"`
}

func AdminGenerateCoupons(w http.ResponseWriter, r *http.Request) {
	var request generateCouponsRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	coupons, err := service.GenerateCoupons(request.Count, request.Credits, request.ExpiresAt)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, coupons)
}

func AdminCoupons(w http.ResponseWriter, r *http.Request) {
	q := parseQuery(r)
	status := r.URL.Query().Get("status")
	result, err := service.ListCoupons(q, status)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}


func AdminDeleteCoupons(w http.ResponseWriter, r *http.Request) {
	var request adminBatchDeleteRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	if err := service.DeleteCoupons(request.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func RedeemCoupon(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var request redeemCouponRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	balance, err := service.RedeemCoupon(user.ID, request.Code)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, map[string]any{"balance": balance})
}
