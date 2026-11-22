package server

// 新しい版の確かめ: 常駐は、立ったときと 1 日ごとに（利用者の設定が許せば）、利用者が頼めばいつでも、matomezu の新しい版があるかを確かめ、
// 結果（UpdateStatus）を持って、全部の窓に知らせる（update-status）。聞く口は SetUpdateCheck で渡す（開発の版は渡さない）。
// 利用者は、管理者のワークルームの AI に版を上げるよう頼める（AskUpdate。起こす知らせ wakeUpdate で、AI が端末で matomezu update を打つ）

import (
	"context"
	"slices"
	"time"

	"github.com/umaxyon/matomezu/internal/storage"
)

// 新しい版の確かめの様子
const (
	UpdateUnchecked = "unchecked" // まだ確かめていない
	UpdateCurrent   = "current"   // 確かめた。今の版が一番新しい
	UpdateNewer     = "newer"     // 確かめた。新しい版がある（Latest）
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

// CheckUpdate は、利用者が頼んだ確かめ: 新しい版を聞き、結果を覚えて知らせる。聞けなければ誤りを返し、前の結果のまま（知らせない）
func (h *Hub) CheckUpdate(ctx context.Context) (UpdateStatus, error) {
	return h.checkUpdate(ctx)
}

// CheckUpdateIfOn は、常駐が自分で行う確かめ: 利用者の設定が許せば聞く。聞けなければ前の結果のまま
func (h *Hub) CheckUpdateIfOn(ctx context.Context) {
	settings, _ := h.Data()
	if on, err := h.engine.UpdateCheck(settings); err != nil || !on {
		return
	}
	h.checkUpdate(ctx)
}

func (h *Hub) checkUpdate(ctx context.Context) (UpdateStatus, error) {
	h.updateMu.Lock()
	latest := h.latest
	h.updateMu.Unlock()
	if latest == nil {
		return h.UpdateStatus(), nil
	}
	v, newer, err := latest(ctx)
	if err != nil {
		return h.UpdateStatus(), err
	}
	h.updateMu.Lock()
	h.update.State, h.update.Latest = UpdateCurrent, v
	if newer {
		h.update.State = UpdateNewer
	}
	h.update.CheckedAt = storage.Stamp(time.Now())
	s := h.update
	h.updateMu.Unlock()
	h.broadcast("update-status", s)
	return s, nil
}

// askUpdateLine は、版を上げるよう頼まれた AI に流す 1 行
const askUpdateLine = `matomezu: the user asks you to update matomezu. Run "matomezu update" in a terminal and tell the user the result.`

// AskUpdate は、ワークルーム workroom（id）の、参加が確定した参加者に、版を上げるよう頼む（まだ渡していない前の頼みは置き換える）。
// 参加が確定した参加者がいなければ ok は偽。頼んだら時刻を覚えて全部の窓に知らせる
func (h *Hub) AskUpdate(workroom string, now time.Time) (ok bool, err error) {
	h.mu.Lock()
	records, err := h.participantsHeld()
	if err != nil {
		h.mu.Unlock()
		return false, err
	}
	to := h.occupants(records)[workroom]
	if to == "" || workroom == "" {
		h.mu.Unlock()
		return false, nil
	}
	if q := h.wakeQueue[to]; q != nil {
		h.wakeQueue[to] = slices.DeleteFunc(q, func(it wakeItem) bool { return it.kind == wakeUpdate && it.lentTo == 0 })
	}
	h.enqueueWake(wakeItem{participant: to, kind: wakeUpdate, line: askUpdateLine})
	h.mu.Unlock()
	h.updateMu.Lock()
	h.update.AskedAt = storage.Stamp(now)
	s := h.update
	h.updateMu.Unlock()
	h.broadcast("update-status", s)
	return true, nil
}
