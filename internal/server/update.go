package server

// 新しい版の確かめ: 常駐は、立ったときと 1 日ごとに（利用者の設定が許せば）、利用者が頼めばいつでも、matomezu の新しい版があるかを確かめ、
// 結果（UpdateStatus）を持って、全部の窓に知らせる（update-status）。聞く口は SetUpdateCheck で渡す（開発の版は渡さない）

import (
	"context"
	"time"

	"github.com/umaxyon/matomezu/internal/storage"
)

// 新しい版の確かめの様子
const (
	UpdateUnchecked = "unchecked" // まだ確かめていない
	UpdateCurrent   = "current"   // 確かめた。今の版が一番新しい
	UpdateNewer     = "newer"     // 確かめた。新しい版がある（Latest）
	UpdateFailed    = "failed"    // 利用者が頼んだ確かめが、聞けずに終わった
	UpdateDev       = "dev"       // 開発の版なので確かめない
)

// UpdateStatus は、新しい版の確かめの結果。CheckedAt は最後に聞けた時刻、AskedAt は管理者に更新を頼んだ時刻（無ければ空）
type UpdateStatus struct {
	State     string `json:"state"`
	Version   string `json:"version"`
	Latest    string `json:"latest,omitempty"`
	CheckedAt string `json:"checkedAt,omitempty"`
	AskedAt   string `json:"askedAt,omitempty"`
}

// LatestFunc は、一番新しい版を聞き、今の版より新しいかを答える
type LatestFunc func(ctx context.Context) (latest string, newer bool, err error)

// SetUpdateCheck は、今の版 version と、新しい版を聞く口 latest を渡す。latest が nil なら（開発の版）確かめない
func (h *Hub) SetUpdateCheck(version string, latest LatestFunc) {
	h.updateMu.Lock()
	defer h.updateMu.Unlock()
	h.latest = latest
	h.update = UpdateStatus{State: UpdateUnchecked, Version: version}
	if latest == nil {
		h.update.State = UpdateDev
	}
}

// UpdateStatus は、今の新しい版の確かめの結果
func (h *Hub) UpdateStatus() UpdateStatus {
	h.updateMu.Lock()
	defer h.updateMu.Unlock()
	return h.update
}

// CheckUpdate は、利用者が頼んだ確かめ: 新しい版を聞き、結果を覚えて知らせる。聞けなければ failed
func (h *Hub) CheckUpdate(ctx context.Context) UpdateStatus {
	return h.checkUpdate(ctx, true)
}

// CheckUpdateIfOn は、常駐が自分で行う確かめ: 利用者の設定が許せば聞く。聞けなければ前の結果のまま
func (h *Hub) CheckUpdateIfOn(ctx context.Context) {
	settings, _ := h.Data()
	if on, err := h.engine.UpdateCheck(settings); err != nil || !on {
		return
	}
	h.checkUpdate(ctx, false)
}

func (h *Hub) checkUpdate(ctx context.Context, asked bool) UpdateStatus {
	h.updateMu.Lock()
	latest := h.latest
	h.updateMu.Unlock()
	if latest == nil {
		return h.UpdateStatus()
	}
	v, newer, err := latest(ctx)
	h.updateMu.Lock()
	switch {
	case err != nil && !asked:
		h.updateMu.Unlock()
		return h.UpdateStatus()
	case err != nil:
		h.update.State = UpdateFailed
	case newer:
		h.update.State, h.update.Latest = UpdateNewer, v
	default:
		h.update.State, h.update.Latest = UpdateCurrent, v
	}
	if err == nil {
		h.update.CheckedAt = storage.Stamp(time.Now())
	}
	s := h.update
	h.updateMu.Unlock()
	h.broadcast("update-status", s)
	return s
}
