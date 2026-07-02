package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

func SubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListSubscriptionPlans(model.Query{Page: 1, PageSize: 100}, true)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result.Items)
}

func CurrentSubscription(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	summary, ok, err := service.GetCurrentSubscriptionSummary(user.ID)
	if err != nil {
		FailError(w, err)
		return
	}
	if !ok {
		OK(w, nil)
		return
	}
	OK(w, summary)
}

func AdminSubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListSubscriptionPlans(parseQuery(r), false)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSaveSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	var plan model.SubscriptionPlan
	_ = json.NewDecoder(r.Body).Decode(&plan)
	result, err := service.SaveSubscriptionPlan(plan)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDisableSubscriptionPlan(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DisableSubscriptionPlan(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
