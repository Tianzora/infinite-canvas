package service

import (
	"log"
	"sync"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/robfig/cron/v3"
)

const (
	legacyPromptSyncCron  = "*/5 * * * *"
	defaultPromptSyncCron = "*/30 * * * *"
)

var (
	promptSyncCron *cron.Cron
	promptSyncOnce sync.Once
	promptSyncMu   sync.Mutex
)

func StartPromptSyncScheduler() {
	promptSyncOnce.Do(func() {
		promptSyncCron = cron.New()
		promptSyncCron.Start()
	})
	RefreshPromptSyncScheduler()
}

func RefreshPromptSyncScheduler() {
	promptSyncMu.Lock()
	defer promptSyncMu.Unlock()
	if promptSyncCron == nil {
		return
	}
	for _, entry := range promptSyncCron.Entries() {
		promptSyncCron.Remove(entry.ID)
	}
	settings, err := repository.GetSettings()
	if err != nil {
		log.Printf("load prompt sync setting failed err=%v", err)
		return
	}
	setting := normalizePromptSyncSetting(settings.Private.PromptSync)
	if setting.Enabled == nil || !*setting.Enabled {
		return
	}
	if _, err := promptSyncCron.AddFunc(setting.Cron, SyncRemotePromptCategories); err != nil {
		log.Printf("add prompt sync cron failed cron=%s err=%v", setting.Cron, err)
	}
}

// SyncRemotePromptCategories 同步全部已启用的远程提示词源。
func SyncRemotePromptCategories() {
	unlock, ok := tryLockPromptSync()
	if !ok {
		log.Printf("scheduled prompt sync skipped: another sync is running")
		return
	}
	defer unlock()

	sources, err := repository.ListEnabledPromptSources()
	if err != nil {
		log.Printf("load prompt sources failed err=%v", err)
		return
	}
	for _, source := range sources {
		log.Printf("scheduled prompt sync start category=%s", source.Category)
		if _, err := syncPromptCategory(source.Category); err != nil {
			log.Printf("scheduled prompt sync failed category=%s err=%v", source.Category, err)
			continue
		}
		log.Printf("scheduled prompt sync done category=%s", source.Category)
	}
}

func normalizePromptSyncSetting(setting model.PromptSyncSetting) model.PromptSyncSetting {
	if setting.Cron == "" || setting.Cron == legacyPromptSyncCron {
		setting.Cron = defaultPromptSyncCron
	}
	if setting.Enabled == nil {
		enabled := true
		setting.Enabled = &enabled
	}
	return setting
}
