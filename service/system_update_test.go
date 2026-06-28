package service

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
)

func TestAdminTriggerSystemUpdateUsesFastComposeUpdateWithoutRewritingCompose(t *testing.T) {
	previousConfig := config.Cfg
	previousRunner := runSystemUpdateCommand
	t.Cleanup(func() {
		config.Cfg = previousConfig
		runSystemUpdateCommand = previousRunner
	})

	dir := t.TempDir()
	composePath := filepath.Join(dir, "docker-compose.yml")
	composeContent := "services:\n  app:\n    image: ${SYSTEM_UPDATE_IMAGE:-ghcr.nju.edu.cn/fairchildovo/infinite-canvas:latest}\n"
	if err := os.WriteFile(composePath, []byte(composeContent), 0o644); err != nil {
		t.Fatalf("write compose: %v", err)
	}

	config.Cfg = config.Config{
		SystemUpdateEnabled: true,
		SystemUpdateWorkDir: dir,
		SystemUpdateCompose: "docker-compose.yml",
		SystemUpdateImage:   "mirror.example/infinite-canvas:latest",
	}
	type call struct {
		env  []string
		name string
		args []string
	}
	var calls []call
	runSystemUpdateCommand = func(_ context.Context, _ string, env []string, name string, args ...string) (string, error) {
		calls = append(calls, call{env: append([]string{}, env...), name: name, args: append([]string{}, args...)})
		return "ok", nil
	}

	result, err := AdminTriggerSystemUpdate()
	if err != nil {
		t.Fatalf("AdminTriggerSystemUpdate returned error: %v", err)
	}
	if result.Status != "triggered" {
		t.Fatalf("status = %q, want triggered", result.Status)
	}
	after, err := os.ReadFile(composePath)
	if err != nil {
		t.Fatalf("read compose: %v", err)
	}
	if string(after) != composeContent {
		t.Fatalf("compose was rewritten:\n%s", string(after))
	}
	if len(calls) != 3 {
		t.Fatalf("calls len = %d, want 3", len(calls))
	}
	wantPullArgs := []string{"compose", "-f", composePath, "pull"}
	if calls[1].name != "docker" || !reflect.DeepEqual(calls[1].args, wantPullArgs) {
		t.Fatalf("pull call = %#v", calls[1])
	}
	wantUpArgs := []string{"compose", "-f", composePath, "up", "-d"}
	if calls[2].name != "docker" || !reflect.DeepEqual(calls[2].args, wantUpArgs) {
		t.Fatalf("up call = %#v", calls[2])
	}
	if !containsString(calls[1].env, "SYSTEM_UPDATE_IMAGE=mirror.example/infinite-canvas:latest") {
		t.Fatalf("pull env = %#v", calls[1].env)
	}
	if strings.Contains(strings.Join(calls[2].args, " "), "--force-recreate") {
		t.Fatalf("up args should not force recreate: %#v", calls[2].args)
	}
}

func containsString(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}
