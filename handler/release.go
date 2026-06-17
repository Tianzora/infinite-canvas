package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

// Releases 前台获取版本更新列表。
func Releases(w http.ResponseWriter, r *http.Request) {
	items, err := service.ListPublicReleases()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, items)
}

// AdminReleases 管理后台分页查询版本更新。
func AdminReleases(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListReleases(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

// AdminSaveRelease 管理后台保存版本更新。
func AdminSaveRelease(w http.ResponseWriter, r *http.Request) {
	var item model.Release
	_ = json.NewDecoder(r.Body).Decode(&item)
	result, err := service.SaveRelease(item)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

// AdminDeleteRelease 管理后台删除版本更新。
func AdminDeleteRelease(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteRelease(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

// AdminDeleteReleases 管理后台批量删除版本更新。
func AdminDeleteReleases(w http.ResponseWriter, r *http.Request) {
	var request adminBatchDeleteRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	if err := service.DeleteReleases(request.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

// AdminGenerateRelease 管理后台 AI 自动生成版本更新。
func AdminGenerateRelease(w http.ResponseWriter, r *http.Request) {
	var req model.GenerateReleaseRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	result, err := service.GenerateReleaseNote(req)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
