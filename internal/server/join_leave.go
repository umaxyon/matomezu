package server

// 参加者の退室: 会話が終わった参加者と、しばらく呼ばれないビジターを外す

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

// sessionEnded は、参加者 id が、セッションと同じだけ生きるプロセスを名乗っていて、そのプロセスが終わっているか（ProcessSpaceEnded。名乗っていない・確かめられないなら false で、退室させない側に倒す）
func (h *Hub) sessionEnded(id string) bool {
	h.mu.Lock()
	n := h.participantNotes[id]
	h.mu.Unlock()
	return n.SessionPid != "" && ProcessSpaceEnded(n.SessionPidSpace, ProcessSpace(), n.SessionPid, ProcessAlive)
}

// leaveEnded は、セッションが終わった参加者 id を、利用者として退室させる（ワークルームは空室で残る。アクションは定義が役 runsWhenAIEnds で名乗る）。
// 起こす知らせの行列は、宛先が参加者でなくなったので捨てられる（watch.go の stale）
func (h *Hub) leaveEnded(id string) error {
	return h.leave(id, "its session ended")
}

// leave は、参加者 id を、利用者として退室させる（なぜ退室させたかを why でログに残す）
func (h *Hub) leave(id, why string) error {
	ids, err := h.engine.EndActions()
	if err != nil {
		return err
	}
	if ids == nil {
		return nil
	}
	fmt.Fprintln(os.Stderr, "participant", id, "left:", why)
	done, err := h.Perform(performOne(ids.Leave, json.RawMessage("{}"), &engine.On{Record: id}))
	if err != nil {
		return err
	}
	if !done.OK {
		return fmt.Errorf("participant %s could not leave: %s", id, done.Detail)
	}
	return nil
}

// VisitorIdle は、ビジターを退室させるまでの、呼ばれない間（最後に呼ばれてから。呼ばれていなければ受け入れてから）
const VisitorIdle = 5 * time.Minute

// VisitorSweepEvery は、呼ばれないビジターを見回る間隔
const VisitorSweepEvery = 30 * time.Second

// LeaveIdleVisitors は、時点 now までに VisitorIdle の間呼ばれていないビジターを、利用者として退室させる
func (h *Hub) LeaveIdleVisitors(now time.Time) error {
	records, err := h.records()
	if err != nil {
		return err
	}
	for _, s := range records {
		if s.State != stateVisitor {
			continue
		}
		h.mu.Lock()
		last := h.participantNotes[s.ID].Called
		h.mu.Unlock()
		if last == "" {
			last = s.JoinedAt
		}
		at, err := time.Parse(time.RFC3339Nano, last)
		if err != nil || now.Sub(at) < VisitorIdle {
			continue
		}
		if err := h.leave(s.ID, "a visitor was not called for "+VisitorIdle.String()); err != nil {
			return err
		}
	}
	return nil
}
