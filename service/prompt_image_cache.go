package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
)

const promptImageTimeout = 15 * time.Second

// CachePromptImage 下载外部图片到本地缓存，返回本地访问路径。
// 如果 imageURL 已是本地路径则直接返回。
func CachePromptImage(category, imageURL string) (string, error) {
	if imageURL == "" {
		return "", nil
	}
	if strings.HasPrefix(imageURL, "/api/media/prompts/") {
		return imageURL, nil
	}

	hash := sha256Sum(imageURL)[:12]
	ext := guessImageExt(imageURL)
	filename := hash + ext

	dir := filepath.Join(promptImagesDir(), safeName(category))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	localPath := filepath.Join(dir, filename)

	if _, err := os.Stat(localPath); err == nil {
		return "/api/media/prompts/images/" + safeName(category) + "/" + filename, nil
	}

	client := http.Client{Timeout: promptImageTimeout}
	resp, err := client.Get(imageURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", errors.New("image fetch failed: " + resp.Status)
	}

	tmpPath := localPath + ".tmp"
	f, err := os.Create(tmpPath)
	if err != nil {
		return "", err
	}
	if _, err = io.Copy(f, resp.Body); err != nil {
		f.Close()
		_ = os.Remove(tmpPath)
		return "", err
	}
	f.Close()

	if err := os.Rename(tmpPath, localPath); err != nil {
		_ = os.Remove(tmpPath)
		return "", err
	}
	return "/api/media/prompts/images/" + safeName(category) + "/" + filename, nil
}

func promptImagesDir() string {
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

func sha256Sum(value string) string {
	h := sha256.Sum256([]byte(value))
	return hex.EncodeToString(h[:])
}

func guessImageExt(url string) string {
	lower := strings.ToLower(url)
	for _, pair := range [][2]string{
		{".webp", ".webp"}, {".png", ".png"}, {".gif", ".gif"}, {".bmp", ".bmp"},
		{".jpeg", ".jpg"}, {".jpg", ".jpg"},
	} {
		if strings.Contains(lower, pair[0]) {
			return pair[1]
		}
	}
	return ".jpg"
}

func safeName(name string) string {
	return strings.NewReplacer("..", "_", "/", "_", "\\", "_", ":", "_").Replace(name)
}
