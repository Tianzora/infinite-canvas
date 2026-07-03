package handler_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/router"
	"github.com/basketikun/infinite-canvas/service"
)

func TestAdminGenerateReleaseUsesRequestedTextModel(t *testing.T) {
	previousConfig := config.Cfg
	t.Cleanup(func() { config.Cfg = previousConfig })

	upstreamModels := make(chan string, 1)
	upstream := newLocalHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var payload struct {
			Model string `json:"model"`
		}
		_ = json.Unmarshal(body, &payload)
		upstreamModels <- payload.Model
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"+ [新增] 文本模型选择"}}]}`))
	}))
	defer upstream.Close()

	config.Cfg = config.Config{
		StorageDriver:  "sqlite",
		DatabaseDSN:    "file:release-generate-model-test?mode=memory&cache=shared",
		JWTSecret:      "test-secret",
		JWTExpireHours: 1,
	}
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{DefaultTextModel: "default-text"},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Name:    "text-upstream",
				BaseURL: upstream.URL,
				APIKey:  "upstream-key",
				Models:  []string{"default-text", "selected-text"},
				Weight:  1,
				Enabled: true,
			}},
		},
	}, time.Now().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}
	session, err := service.SaveUser(model.User{Username: "release-admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}, "secret")
	if err != nil {
		t.Fatalf("save admin: %v", err)
	}
	auth, err := service.Login(session.Username, "secret")
	if err != nil {
		t.Fatalf("login admin: %v", err)
	}

	server := newLocalHTTPServer(t, router.New())
	defer server.Close()
	body, _ := json.Marshal(map[string]any{
		"version": "v9.9.9",
		"title":   "AI 生成更新记录",
		"notes":   "添加文本模型选择",
		"model":   "selected-text",
	})
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/admin/releases/generate", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+auth.Token)
	request.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("generate request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		responseBody, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d body = %s", response.StatusCode, responseBody)
	}
	select {
	case modelName := <-upstreamModels:
		if modelName != "selected-text" {
			t.Fatalf("upstream model = %q, want selected-text", modelName)
		}
	case <-time.After(time.Second):
		t.Fatal("upstream did not receive request")
	}
}

func newLocalHTTPServer(t *testing.T, handler http.Handler) *httptest.Server {
	t.Helper()
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen local server: %v", err)
	}
	server := &httptest.Server{
		Listener: listener,
		Config:   &http.Server{Handler: handler},
	}
	server.Start()
	return server
}
