package service

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
)

type SystemUpdateResult struct {
	Stage  string `json:"stage"`
	Status string `json:"status"`
	Log    string `json:"log"`
}

var secretLikePattern = regexp.MustCompile(`(?i)(token|secret|password|api[_-]?key)=\S+`)

var runSystemUpdateCommand = runUpdateCommand

func AdminTriggerSystemUpdate() (SystemUpdateResult, error) {
	if !config.Cfg.SystemUpdateEnabled {
		return SystemUpdateResult{Stage: "precheck", Status: "unsupported", Log: "SYSTEM_UPDATE_ENABLED 未开启"}, safeMessageError{message: "当前环境未开启一键更新，请配置 SYSTEM_UPDATE_ENABLED=true"}
	}
	workDir := strings.TrimSpace(config.Cfg.SystemUpdateWorkDir)
	if workDir == "" {
		return SystemUpdateResult{Stage: "precheck", Status: "unsupported", Log: "SYSTEM_UPDATE_WORK_DIR 为空"}, safeMessageError{message: "缺少 SYSTEM_UPDATE_WORK_DIR，无法定位 docker compose 目录"}
	}
	composeFile := strings.TrimSpace(config.Cfg.SystemUpdateCompose)
	if composeFile == "" {
		composeFile = "docker-compose.yml"
	}
	if !filepath.IsAbs(composeFile) {
		composeFile = filepath.Join(workDir, composeFile)
	}
	composeContent, err := os.ReadFile(composeFile)
	if err != nil {
		return SystemUpdateResult{Stage: "precheck", Status: "unsupported", Log: "无法读取 compose 文件"}, safeMessageError{message: "无法读取 SYSTEM_UPDATE_COMPOSE_FILE 指向的 docker compose 文件"}
	}
	if !strings.Contains(string(composeContent), "fairchildovo/infinite-canvas") {
		return SystemUpdateResult{Stage: "precheck", Status: "unsupported", Log: "compose 文件未指向 fairchildovo 镜像"}, safeMessageError{message: "docker compose 文件未指向 fairchildovo/infinite-canvas 镜像"}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	composeCommand, composeArgs, err := resolveComposeCommand(ctx, workDir)
	if err != nil {
		return SystemUpdateResult{Stage: "precheck", Status: "unsupported", Log: "未找到 docker compose 命令"}, safeMessageError{message: "当前环境未安装 docker compose 或 docker-compose"}
	}
	updateEnv := systemUpdateEnv()
	if output, err := runSystemUpdateCommand(ctx, workDir, updateEnv, composeCommand, append(composeArgs, "-f", composeFile, "pull")...); err != nil {
		return SystemUpdateResult{Stage: "pull", Status: "failed", Log: output}, safeMessageError{message: "拉取 Docker 镜像失败：" + shortLog(output, err)}
	}
	output, err := runSystemUpdateCommand(ctx, workDir, updateEnv, composeCommand, append(composeArgs, "-f", composeFile, "up", "-d")...)
	if err != nil {
		return SystemUpdateResult{Stage: "restart", Status: "failed", Log: output}, safeMessageError{message: "重启 Docker 服务失败：" + shortLog(output, err)}
	}
	return SystemUpdateResult{Stage: "restart", Status: "triggered", Log: output}, nil
}

func resolveComposeCommand(ctx context.Context, workDir string) (string, []string, error) {
	if _, err := runSystemUpdateCommand(ctx, workDir, nil, "docker", "compose", "version"); err == nil {
		return "docker", []string{"compose"}, nil
	}
	if _, err := runSystemUpdateCommand(ctx, workDir, nil, "docker-compose", "version"); err == nil {
		return "docker-compose", nil, nil
	}
	return "", nil, exec.ErrNotFound
}

func runUpdateCommand(ctx context.Context, workDir string, env []string, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = workDir
	if len(env) > 0 {
		cmd.Env = append(os.Environ(), env...)
	}
	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	err := cmd.Run()
	return sanitizeUpdateLog(output.String()), err
}

func systemUpdateEnv() []string {
	updateImage := strings.TrimSpace(config.Cfg.SystemUpdateImage)
	if updateImage == "" {
		updateImage = "ghcr.nju.edu.cn/fairchildovo/infinite-canvas:latest"
	}
	return []string{"SYSTEM_UPDATE_IMAGE=" + updateImage}
}

func sanitizeUpdateLog(log string) string {
	log = secretLikePattern.ReplaceAllString(log, "$1=***")
	lines := strings.Split(log, "\n")
	if len(lines) > 24 {
		lines = lines[len(lines)-24:]
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func shortLog(output string, err error) string {
	output = strings.TrimSpace(output)
	if output == "" {
		if errors.Is(err, exec.ErrNotFound) {
			return "未找到 docker 命令"
		}
		return err.Error()
	}
	if len(output) > 180 {
		return output[:180] + "..."
	}
	return output
}
