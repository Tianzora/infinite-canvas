package handler_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/router"
	"github.com/basketikun/infinite-canvas/service"
)

type capturedAIRequest struct {
	path          string
	rawQuery      string
	authorization string
	body          []byte
}

func TestAIChatCompletionsProxyStreamsAndRewritesAlias(t *testing.T) {
	previousConfig := config.Cfg
	t.Cleanup(func() { config.Cfg = previousConfig })

	upstreamRequests := make(chan capturedAIRequest, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		upstreamRequests <- capturedAIRequest{
			path:          r.URL.Path,
			rawQuery:      r.URL.RawQuery,
			authorization: r.Header.Get("Authorization"),
			body:          body,
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write([]byte("data: first\n\n"))
		w.(http.Flusher).Flush()
		time.Sleep(400 * time.Millisecond)
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
		w.(http.Flusher).Flush()
	}))
	defer upstream.Close()

	config.Cfg = config.Config{
		StorageDriver:  "sqlite",
		DatabaseDSN:    "file:ai-proxy-test?mode=memory&cache=shared",
		JWTSecret:      "test-secret",
		JWTExpireHours: 1,
	}
	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Name:    "test-upstream",
				BaseURL: upstream.URL,
				APIKey:  "upstream-key",
				Models:  []string{"gpt-5-5"},
				ModelAliases: []model.ModelAlias{{
					Model:       "gpt-5-5",
					DisplayName: "gpt-5.5",
				}},
				Weight:  1,
				Enabled: true,
			}},
		},
	}, time.Now().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}
	session, err := service.Register("agent-user", "secret")
	if err != nil {
		t.Fatalf("register user: %v", err)
	}

	server := httptest.NewServer(router.New())
	defer server.Close()

	payload := map[string]any{
		"model":    "gpt-5.5",
		"messages": []map[string]string{{"role": "user", "content": "hi"}},
		"stream":   true,
	}
	body, _ := json.Marshal(payload)
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+session.Token)
	request.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("chat proxy request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		responseBody, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d body = %s", response.StatusCode, responseBody)
	}
	if contentType := response.Header.Get("Content-Type"); !strings.Contains(contentType, "text/event-stream") {
		t.Fatalf("content type = %q, want text/event-stream", contentType)
	}

	firstChunk := make(chan string, 1)
	go func() {
		buffer := make([]byte, 64)
		n, _ := response.Body.Read(buffer)
		firstChunk <- string(buffer[:n])
	}()
	select {
	case chunk := <-firstChunk:
		if !strings.Contains(chunk, "data: first") {
			t.Fatalf("first chunk = %q, want SSE data", chunk)
		}
	case <-time.After(250 * time.Millisecond):
		t.Fatal("timed out waiting for first SSE chunk")
	}
	rest, _ := io.ReadAll(response.Body)
	if !strings.Contains(string(rest), "data: [DONE]") {
		t.Fatalf("rest = %q, want done chunk", string(rest))
	}

	var captured capturedAIRequest
	select {
	case captured = <-upstreamRequests:
	case <-time.After(time.Second):
		t.Fatal("upstream did not receive request")
	}
	if captured.path != "/v1/chat/completions" {
		t.Fatalf("upstream path = %q, want /v1/chat/completions", captured.path)
	}
	if captured.authorization != "Bearer upstream-key" {
		t.Fatalf("upstream authorization = %q", captured.authorization)
	}
	var upstreamPayload struct {
		Model  string `json:"model"`
		Stream bool   `json:"stream"`
	}
	if err := json.Unmarshal(captured.body, &upstreamPayload); err != nil {
		t.Fatalf("decode upstream body: %v", err)
	}
	if upstreamPayload.Model != "gpt-5-5" {
		t.Fatalf("upstream model = %q, want alias target", upstreamPayload.Model)
	}
	if !upstreamPayload.Stream {
		t.Fatal("upstream stream = false, want true")
	}
}

func TestAIChatCompletionsProxyFailsOverToNextChannelForSameModel(t *testing.T) {
	previousConfig := config.Cfg
	t.Cleanup(func() { config.Cfg = previousConfig })

	failedRequests := make(chan capturedAIRequest, 1)
	failingUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		failedRequests <- capturedAIRequest{path: r.URL.Path, authorization: r.Header.Get("Authorization"), body: body}
		http.Error(w, `{"error":{"message":"provider down"}}`, http.StatusBadGateway)
	}))
	defer failingUpstream.Close()

	okRequests := make(chan capturedAIRequest, 1)
	okUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		okRequests <- capturedAIRequest{path: r.URL.Path, authorization: r.Header.Get("Authorization"), body: body}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer okUpstream.Close()

	config.Cfg = config.Config{
		StorageDriver:  "sqlite",
		DatabaseDSN:    "file:ai-proxy-failover-test?mode=memory&cache=shared",
		JWTSecret:      "test-secret",
		JWTExpireHours: 1,
	}
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{ModelCosts: []model.ModelCost{{Model: "gpt-image-2", Credits: 3}}},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{
				{Name: "failing", BaseURL: failingUpstream.URL, APIKey: "fail-key", Models: []string{"gpt-image-2"}, Weight: 1000, Enabled: true},
				{Name: "ok", BaseURL: okUpstream.URL, APIKey: "ok-key", Models: []string{"gpt-image-2"}, Weight: 1, Enabled: true},
			},
		},
	}, time.Now().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}
	session, err := service.Register("failover-user", "secret")
	if err != nil {
		t.Fatalf("register user: %v", err)
	}
	if _, err := service.AdjustUserCredits(session.User.ID, 100); err != nil {
		t.Fatalf("adjust credits: %v", err)
	}

	server := httptest.NewServer(router.New())
	defer server.Close()

	body, _ := json.Marshal(map[string]any{
		"model":    "gpt-image-2",
		"messages": []map[string]string{{"role": "user", "content": "hi"}},
	})
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+session.Token)
	request.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("chat proxy request: %v", err)
	}
	defer response.Body.Close()
	responseBody, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d body = %s", response.StatusCode, responseBody)
	}
	if !strings.Contains(string(responseBody), `"ok"`) {
		t.Fatalf("body = %s, want ok upstream response", responseBody)
	}

	select {
	case captured := <-failedRequests:
		if captured.authorization != "Bearer fail-key" {
			t.Fatalf("failing authorization = %q", captured.authorization)
		}
	case <-time.After(time.Second):
		t.Fatal("failing upstream did not receive request")
	}
	select {
	case captured := <-okRequests:
		if captured.authorization != "Bearer ok-key" {
			t.Fatalf("ok authorization = %q", captured.authorization)
		}
	case <-time.After(time.Second):
		t.Fatal("ok upstream did not receive request")
	}

	logs, err := service.ListCreditLogs(model.Query{PageSize: 10})
	if err != nil {
		t.Fatalf("list credit logs: %v", err)
	}
	var consumeExtra map[string]string
	for _, item := range logs.Items {
		if item.Type != model.CreditLogTypeAIConsume {
			continue
		}
		if err := json.Unmarshal([]byte(item.Extra), &consumeExtra); err != nil {
			t.Fatalf("decode consume extra: %v", err)
		}
		break
	}
	if consumeExtra["channel"] != "ok" {
		t.Fatalf("credit log channel = %q, want ok", consumeExtra["channel"])
	}
}

func TestAIProxyRefundLogIncludesFailureReason(t *testing.T) {
	previousConfig := config.Cfg
	t.Cleanup(func() { config.Cfg = previousConfig })

	failingUpstream := newLocalHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"message":"image quota exhausted"}}`, http.StatusTooManyRequests)
	}))
	defer failingUpstream.Close()

	config.Cfg = config.Config{
		StorageDriver:  "sqlite",
		DatabaseDSN:    "file:ai-proxy-refund-reason-test?mode=memory&cache=shared",
		JWTSecret:      "test-secret",
		JWTExpireHours: 1,
	}
	_, err := repository.SaveSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{ModelCosts: []model.ModelCost{{Model: "gpt-image-2", Credits: 3}}},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{
				{Name: "failing", BaseURL: failingUpstream.URL, APIKey: "fail-key", Models: []string{"gpt-image-2"}, Weight: 1, Enabled: true},
			},
		},
	}, time.Now().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}
	session, err := service.Register("refund-user", "secret")
	if err != nil {
		t.Fatalf("register user: %v", err)
	}
	if _, err := service.AdjustUserCredits(session.User.ID, 100); err != nil {
		t.Fatalf("adjust credits: %v", err)
	}

	server := newLocalHTTPServer(t, router.New())
	defer server.Close()

	body, _ := json.Marshal(map[string]any{
		"model":    "gpt-image-2",
		"messages": []map[string]string{{"role": "user", "content": "hi"}},
	})
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+session.Token)
	request.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("chat proxy request: %v", err)
	}
	defer response.Body.Close()

	logs, err := service.ListCreditLogs(model.Query{PageSize: 10})
	if err != nil {
		t.Fatalf("list credit logs: %v", err)
	}
	var refundExtra map[string]string
	for _, item := range logs.Items {
		if item.Type != model.CreditLogTypeAIRefund {
			continue
		}
		if err := json.Unmarshal([]byte(item.Extra), &refundExtra); err != nil {
			t.Fatalf("decode refund extra: %v", err)
		}
		break
	}
	if !strings.Contains(refundExtra["failureReason"], "image quota exhausted") {
		t.Fatalf("failureReason = %q, want upstream reason", refundExtra["failureReason"])
	}
}

func TestAIVideoByVideoIDProxyUsesAgnesAPIWithoutV1Suffix(t *testing.T) {
	previousConfig := config.Cfg
	t.Cleanup(func() { config.Cfg = previousConfig })

	upstreamRequests := make(chan capturedAIRequest, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamRequests <- capturedAIRequest{
			path:          r.URL.Path,
			rawQuery:      r.URL.RawQuery,
			authorization: r.Header.Get("Authorization"),
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"succeeded","video_url":"https://example.com/video.mp4"}`))
	}))
	defer upstream.Close()

	config.Cfg = config.Config{
		StorageDriver:  "sqlite",
		DatabaseDSN:    "file:ai-video-id-proxy-test?mode=memory&cache=shared",
		JWTSecret:      "test-secret",
		JWTExpireHours: 1,
	}
	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{{
				Name:    "agnes-upstream",
				BaseURL: upstream.URL + "/v1",
				APIKey:  "upstream-key",
				Models:  []string{"agnes-video-v2.0"},
				Weight:  1,
				Enabled: true,
			}},
		},
	}, time.Now().Format(time.RFC3339))
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}
	session, err := service.Register("agnes-user", "secret")
	if err != nil {
		t.Fatalf("register user: %v", err)
	}

	server := httptest.NewServer(router.New())
	defer server.Close()

	request, err := http.NewRequest(http.MethodGet, server.URL+"/api/v1/agnesapi?model=agnes-video-v2.0&video_id=video-123", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+session.Token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("video id proxy request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		responseBody, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d body = %s", response.StatusCode, responseBody)
	}

	var captured capturedAIRequest
	select {
	case captured = <-upstreamRequests:
	case <-time.After(time.Second):
		t.Fatal("upstream did not receive request")
	}
	if captured.path != "/agnesapi" {
		t.Fatalf("upstream path = %q, want /agnesapi", captured.path)
	}
	if captured.rawQuery != "model_name=agnes-video-v2.0&video_id=video-123" {
		t.Fatalf("upstream query = %q, want model_name=agnes-video-v2.0&video_id=video-123", captured.rawQuery)
	}
	if captured.authorization != "Bearer upstream-key" {
		t.Fatalf("upstream authorization = %q", captured.authorization)
	}
}
