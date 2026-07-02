package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/service"
)

func AIImagesGenerations(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/images/generations")
}

func AIImagesEdits(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/images/edits")
}

func AIChatCompletions(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/chat/completions")
}

func AIAudioSpeech(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/audio/speech")
}

func AIVideos(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/videos")
}

func AIVideo(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIGetRequest(w, r, "/videos/"+id)
}

func AIVideoContent(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIGetRequest(w, r, "/videos/"+id+"/content")
}

func AIVideoByVideoID(w http.ResponseWriter, r *http.Request) {
	proxyAIGetRequest(w, r, "/agnesapi")
}

func proxyAIGetRequest(w http.ResponseWriter, r *http.Request, path string) {
	modelName := r.URL.Query().Get("model")
	if strings.TrimSpace(modelName) == "" {
		modelName = "grok-imagine-video"
	}
	candidates, err := service.SelectModelChannelCandidates(modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	lastMessage := "AI 接口请求失败"
	for len(candidates) > 0 {
		selected, remaining := takeWeightedCandidate(candidates)
		candidates = remaining
		upstreamPath := resolveAIProxyPath(selected.Channel.BaseURL, selected.RawModel, path)
		targetURL := service.BuildModelChannelURL(selected.Channel, upstreamPath)
		query := upstreamAIQuery(r, selected.RawModel)
		if query != "" {
			if strings.Contains(targetURL, "?") {
				targetURL += "&" + query
			} else {
				targetURL += "?" + query
			}
		}
		logVideoQueryMode(r, upstreamPath, modelName)
		request, err := http.NewRequest(http.MethodGet, targetURL, nil)
		if err != nil {
			lastMessage = "AI 接口请求失败"
			continue
		}
		request.Header.Set("Authorization", "Bearer "+selected.Channel.APIKey)
		if ok, message := copyAIResponseAttempt(w, request); ok {
			return
		} else if message != "" {
			lastMessage = message
		}
	}
	Fail(w, lastMessage)
}

func upstreamAIQuery(r *http.Request, rawModel string) string {
	query := r.URL.Query()
	query.Del("model")
	if query.Get("video_id") != "" && query.Get("model_name") == "" && strings.TrimSpace(rawModel) != "" {
		query.Set("model_name", rawModel)
	}
	return query.Encode()
}

func logVideoQueryMode(r *http.Request, path string, modelName string) {
	if r.URL.Query().Get("video_id") != "" {
		log.Printf("AI video query: mode=video_id model=%s", modelName)
		return
	}
	if strings.HasPrefix(path, "/videos/") && !strings.HasSuffix(path, "/content") {
		log.Printf("AI video query: mode=task_id model=%s", modelName)
	}
}

func proxyAIRequest(w http.ResponseWriter, r *http.Request, path string) {
	body, contentType, modelName, err := readAIRequest(r)
	if err != nil {
		log.Printf("AI proxy request read failed: %v", err)
		Fail(w, "AI 接口请求失败")
		return
	}
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	credits, err := service.ModelCost(modelName)
	if err != nil {
		log.Printf("AI proxy read model cost failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	credits *= readAIRequestCount(body, contentType)
	candidates, err := service.SelectModelChannelCandidates(modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	reservation, err := service.ReserveUserCredits(user.ID, credits)
	if err != nil {
		FailError(w, err)
		return
	}
	lastMessage := "AI 接口请求失败"
	chargeRawModel := ""
	chargeChannel := ""
	chargePath := ""
	for len(candidates) > 0 {
		selected, remaining := takeWeightedCandidate(candidates)
		candidates = remaining
		requestBody := service.ReplaceModelInBody(body, contentType, modelName, selected.RawModel)
		upstreamPath := resolveAIProxyPath(selected.Channel.BaseURL, selected.RawModel, path)
		chargeRawModel = selected.RawModel
		chargeChannel = selected.Channel.Name
		chargePath = upstreamPath
		targetURL := service.BuildModelChannelURL(selected.Channel, upstreamPath)
		request, err := http.NewRequest(http.MethodPost, targetURL, bytes.NewReader(requestBody))
		if err != nil {
			log.Printf("AI proxy build request failed: url=%s err=%v", targetURL, err)
			lastMessage = "AI 接口请求失败"
			continue
		}
		request.Header.Set("Authorization", "Bearer "+selected.Channel.APIKey)
		if contentType != "" {
			request.Header.Set("Content-Type", contentType)
		}
		if ok, message := copyAIResponseAttempt(w, request); ok {
			if reservation.SubscriptionCredits > 0 {
				err = service.SaveSubscriptionConsumeLog(user.ID, modelName, selected.RawModel, selected.Channel.Name, credits, upstreamPath, reservation)
			}
			if err == nil && (reservation.BalanceCredits > 0 || reservation.Source == service.CreditReservationSourceCredits) {
				balanceCredits := reservation.BalanceCredits
				if balanceCredits == 0 {
					balanceCredits = credits
				}
				err = service.SaveCreditConsumeLog(user.ID, modelName, selected.RawModel, selected.Channel.Name, balanceCredits, upstreamPath)
			}
			if err != nil {
				log.Printf("AI proxy save credit log failed: user=%s model=%s credits=%d err=%v", user.ID, modelName, credits, err)
			}
			return
		} else if message != "" {
			lastMessage = message
		}
	}
	if reservation.Source == service.CreditReservationSourceSubscription {
		err = service.RefundCreditReservation(reservation)
	} else {
		err = service.RefundUserCredits(user.ID, modelName, chargeRawModel, chargeChannel, credits, chargePath)
	}
	if err != nil {
		log.Printf("AI proxy refund credits failed: user=%s model=%s credits=%d err=%v", user.ID, modelName, credits, err)
	}
	Fail(w, lastMessage)
}

func copyAIResponse(w http.ResponseWriter, request *http.Request, onFailure func()) {
	if ok, message := copyAIResponseAttempt(w, request); ok {
		return
	} else {
		if onFailure != nil {
			onFailure()
		}
		Fail(w, message)
	}
}

func copyAIResponseAttempt(w http.ResponseWriter, request *http.Request) (bool, string) {
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("AI proxy request failed: url=%s err=%v", request.URL.String(), err)
		return false, "AI 接口请求失败"
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		log.Printf("AI upstream error: url=%s status=%d", request.URL.String(), response.StatusCode)
		return false, aiUpstreamStatusMessage(response.StatusCode, body)
	}

	for key, values := range response.Header {
		if strings.EqualFold(key, "Content-Length") {
			continue
		}
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(response.StatusCode)
	copyAIResponseBody(w, response.Body)
	return true, ""
}

func takeWeightedCandidate(candidates []service.ModelChannelCandidate) (service.ModelChannelCandidate, []service.ModelChannelCandidate) {
	selected := service.SelectWeightedModelChannel(candidates)
	remaining := make([]service.ModelChannelCandidate, 0, len(candidates)-1)
	removed := false
	for _, item := range candidates {
		if !removed && item.Channel.Name == selected.Channel.Name && item.Channel.BaseURL == selected.Channel.BaseURL && item.RawModel == selected.RawModel {
			removed = true
			continue
		}
		remaining = append(remaining, item)
	}
	return selected, remaining
}

func copyAIResponseBody(w http.ResponseWriter, body io.Reader) {
	flusher, canFlush := w.(http.Flusher)
	if !canFlush {
		_, _ = io.Copy(w, body)
		return
	}
	buffer := make([]byte, 32*1024)
	for {
		n, err := body.Read(buffer)
		if n > 0 {
			if _, writeErr := w.Write(buffer[:n]); writeErr != nil {
				return
			}
			flusher.Flush()
		}
		if err != nil {
			return
		}
	}
}

func readAIRequest(r *http.Request) ([]byte, string, string, error) {
	contentType := r.Header.Get("Content-Type")
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, "", "", err
	}
	modelName := ""
	if strings.HasPrefix(contentType, "multipart/form-data") {
		modelName = readMultipartModel(body, contentType)
	} else {
		var payload struct {
			Model string `json:"model"`
		}
		_ = json.Unmarshal(body, &payload)
		modelName = payload.Model
	}
	if strings.TrimSpace(modelName) == "" {
		return nil, "", "", errMissingModel
	}
	return body, contentType, modelName, nil
}

func readMultipartModel(body []byte, contentType string) string {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return ""
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	form, err := reader.ReadForm(32 << 20)
	if err != nil {
		return ""
	}
	defer form.RemoveAll()
	if values := form.Value["model"]; len(values) > 0 {
		return values[0]
	}
	return ""
}

func readAIRequestCount(body []byte, contentType string) int {
	count := 1
	if strings.HasPrefix(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return count
		}
		form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
		if err != nil {
			return count
		}
		defer form.RemoveAll()
		if values := form.Value["n"]; len(values) > 0 {
			_, _ = fmt.Sscan(values[0], &count)
		}
	} else {
		var payload struct {
			N int `json:"n"`
		}
		_ = json.Unmarshal(body, &payload)
		count = payload.N
	}
	if count < 1 {
		return 1
	}
	return count
}

var errMissingModel = &aiError{"缺少模型名称"}

func resolveAIProxyPath(baseURL string, modelName string, path string) string {
	if !isArkSeedanceVideo(baseURL, modelName) {
		return path
	}
	if path == "/videos" {
		return "/contents/generations/tasks"
	}
	if strings.HasPrefix(path, "/videos/") && !strings.HasSuffix(path, "/content") {
		return "/contents/generations/tasks/" + strings.TrimPrefix(path, "/videos/")
	}
	return path
}

func isArkSeedanceVideo(baseURL string, modelName string) bool {
	base := strings.ToLower(baseURL)
	model := strings.ToLower(modelName)
	return strings.Contains(model, "seedance") || strings.Contains(model, "doubao-seedance") || strings.Contains(base, "/api/plan/v3")
}

func aiStatusMessage(statusCode int) string {
	switch statusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		return "AI 接口鉴权失败，请检查 API Key、套餐权限或模型权限"
	case http.StatusTooManyRequests:
		return "AI 接口限流或额度不足，请稍后重试或检查额度"
	default:
		return "AI 接口请求失败"
	}
}

func aiUpstreamStatusMessage(statusCode int, body []byte) string {
	base := aiStatusMessage(statusCode)
	detail := aiUpstreamErrorDetail(body)
	if detail == "" {
		return base
	}
	return base + "：" + detail
}

func aiUpstreamErrorDetail(body []byte) string {
	text := strings.TrimSpace(string(body))
	if text == "" {
		return ""
	}
	var payload struct {
		Msg     string `json:"msg"`
		Message string `json:"message"`
		Error   struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err == nil {
		if payload.Error.Message != "" {
			if detail := friendlyUpstreamError(payload.Error.Code, payload.Error.Message); detail != "" {
				return safeUpstreamText(detail)
			}
			if payload.Error.Code != "" {
				return safeUpstreamText(payload.Error.Code + " " + payload.Error.Message)
			}
			return safeUpstreamText(payload.Error.Message)
		}
		if payload.Msg != "" {
			return safeUpstreamText(payload.Msg)
		}
		if payload.Message != "" {
			return safeUpstreamText(payload.Message)
		}
	}
	return safeUpstreamText(text)
}

func friendlyUpstreamError(code string, message string) string {
	lowerCode := strings.ToLower(strings.TrimSpace(code))
	if strings.Contains(lowerCode, "inputvideosensitivecontentdetected") || strings.Contains(lowerCode, "privacyinformation") {
		return strings.TrimSpace(code + " 参考视频疑似包含真人或隐私信息，火山方舟拒绝使用普通 URL 作为真人视频参考；请改用不含真人的视频、官方允许的模型产物，或已授权的 asset:// 素材。原始错误：" + message)
	}
	return ""
}

func safeUpstreamText(text string) string {
	text = strings.Join(strings.Fields(strings.TrimSpace(text)), " ")
	runes := []rune(text)
	if len(runes) > 300 {
		return string(runes[:300]) + "..."
	}
	return text
}

type aiError struct {
	message string
}

func (err *aiError) Error() string {
	return err.message
}
