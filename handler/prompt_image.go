package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/basketikun/infinite-canvas/config"
)

// PromptImage 提供缓存的提示词图片。
func PromptImage(w http.ResponseWriter, r *http.Request, category, filename string) {
	if category == "" || filename == "" || category != filepath.Base(category) || filename != filepath.Base(filename) {
		http.NotFound(w, r)
		return
	}
	if strings.Contains(category, "..") || strings.Contains(filename, "..") {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(promptImagesDataDir(), category, filename)
	file, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	if mimeType := imageMimeType(filepath.Ext(filename)); mimeType != "" {
		w.Header().Set("Content-Type", mimeType)
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, filename, info.ModTime(), file)
}

func promptImagesDataDir() string {
	if dir := strings.TrimSpace(os.Getenv("PROMPT_DATA_DIR")); dir != "" {
		return filepath.Join(dir, "images")
	}
	driver := strings.ToLower(strings.TrimSpace(config.Cfg.StorageDriver))
	dsn := strings.TrimSpace(config.Cfg.DatabaseDSN)
	if (driver == "" || driver == "sqlite") && dsn != "" && dsn != ":memory:" && !strings.HasPrefix(dsn, "file:") {
		pathPart := dsn
		if idx := strings.Index(dsn, "?"); idx >= 0 {
			pathPart = dsn[:idx]
		}
		if filepath.IsAbs(pathPart) {
			return filepath.Join(filepath.Dir(pathPart), "prompts", "images")
		}
	}
	if _, err := os.Stat("/app/data"); err == nil {
		return "/app/data/prompts/images"
	}
	return filepath.Join("data", "prompts", "images")
}

func imageMimeType(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".bmp":
		return "image/bmp"
	}
	return ""
}
