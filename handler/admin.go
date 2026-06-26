package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type adminSyncRequest struct {
	Category string `json:"category"`
}

type adminBatchDeleteRequest struct {
	IDs []string `json:"ids"`
}

func AdminPromptCategories(w http.ResponseWriter, r *http.Request) {
	OK(w, service.ListPromptCategories())
}

func AdminPrompts(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListPrompts(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSavePrompt(w http.ResponseWriter, r *http.Request) {
	var item model.Prompt
	_ = json.NewDecoder(r.Body).Decode(&item)
	result, err := service.SavePrompt(item)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeletePrompt(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeletePrompt(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminDeletePrompts(w http.ResponseWriter, r *http.Request) {
	var request adminBatchDeleteRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	if err := service.DeletePrompts(request.IDs); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminSyncPromptCategories(w http.ResponseWriter, r *http.Request) {
	var request adminSyncRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	log.Printf("sync prompt category start category=%s", request.Category)
	categories, err := service.SyncPromptCategory(request.Category)
	if err != nil {
		log.Printf("sync prompt category failed category=%s err=%v", request.Category, err)
		FailError(w, err)
		return
	}
	log.Printf("sync prompt category done category=%s", request.Category)
	OK(w, categories)
}

// ── 远程源管理 ──

func AdminPromptSources(w http.ResponseWriter, r *http.Request) {
	sources, err := service.ListPromptSources()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, sources)
}

func AdminSavePromptSource(w http.ResponseWriter, r *http.Request) {
	var source model.PromptSource
	if err := json.NewDecoder(r.Body).Decode(&source); err != nil {
		Fail(w, "请求格式不正确")
		return
	}
	if err := service.SavePromptSource(source); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminDeletePromptSource(w http.ResponseWriter, r *http.Request, category string) {
	if err := service.DeletePromptSource(category); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}
