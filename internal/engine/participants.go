package engine

import (
	"encoding/json"
	"fmt"
	"time"
)

// JoinActions は、AI が参加を頼むときに行うアクションの id（参加者を作る Participant）と、要求をキャンセルとして終えるアクションの id（Cancel。無ければ空）
type JoinActions struct {
	Participant string `json:"participant"`
	Rejoin      string `json:"rejoin,omitempty"` // 受け入れ済みの参加者が参加を頼み直したときに、その参加者のレコードに行う（無ければ空）
	Cancel      string `json:"cancel,omitempty"`
}

// JoinActions は、AI が参加を頼むときに行うアクション。アクションの定義が役を名乗る（Go はアクションの id を知らない）
func (e *Engine) JoinActions() (ids *JoinActions, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.join()), &ids)
	return ids, err
}

// EndActions は、参加者のセッションが終わったときに常駐が行うアクションの id（参加者を外す Leave）
type EndActions struct {
	Leave string `json:"leave"`
}

// EndActions は、参加者のセッションが終わったときに常駐が行うアクション。アクションの定義が役を名乗る（Go はアクションの id を知らない）。無ければ nil
func (e *Engine) EndActions() (ids *EndActions, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.end()), &ids)
	return ids, err
}

// JoinedText は、参加を利用者に伝える文（利用者の設定 settings の言語）
func (e *Engine) JoinedText(settings json.RawMessage, workroom string) (text string, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return e.joinedMsg(string(settings), workroom), nil
}

// VisitorJoinedText は、ビジターとして参加したことを利用者に伝える文（利用者の設定 settings の言語）
func (e *Engine) VisitorJoinedText(settings json.RawMessage) (text string, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return e.visitorMsg(string(settings)), nil
}

// ParticipantAlive は、参加者が時点 now で生きているか（最後に呼ばれた時刻 calledAt は RFC 3339 の文字。空なら呼ばれていない。
// wake は、起こす知らせを渡せる matomezu watch がつながっているか（WakeReaches・WakeNone）。利用者の設定 settings の参加の有効時間で決まる）
func (e *Engine) ParticipantAlive(settings json.RawMessage, calledAt, wake string, now time.Time) (alive bool, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return e.alive(string(settings), calledAt, wake, float64(now.UnixMilli())), nil
}

// ParticipantLapsesAt は、最後に呼ばれた時刻 calledAt から参加の有効時間が過ぎる時点（呼ばれていないか読めない時刻なら ok が false）
func (e *Engine) ParticipantLapsesAt(settings json.RawMessage, calledAt string) (at time.Time, ok bool, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	ms := e.lapsesAt(string(settings), calledAt)
	if ms <= 0 {
		return time.Time{}, false, nil
	}
	return time.UnixMilli(int64(ms)), true, nil
}

// 起こす知らせを渡せる matomezu watch がつながっているか（core/settings.ts の WAKE_REACH）
const (
	WakeReaches = "reaches"
	WakeNone    = "none"
)

// WorkTitle は、ワークルーム（id と名前 name）に参加している AI のセッションに書く名前。利用者の設定 settings が書き換えを止めていれば、書かない（ok が false）。
// ワークルームの作業はレコードから決まるので、レコードを引く口 src を渡す
func (e *Engine) WorkTitle(settings json.RawMessage, workroom, name string, src Source) (title string, ok bool, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.source = src
	defer func() { e.source = nil }()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	var got struct {
		Kind  string `json:"kind"`
		Title string `json:"title"`
	}
	if err := json.Unmarshal([]byte(e.workTitle(string(settings), workroom, name)), &got); err != nil {
		return "", false, err
	}
	return got.Title, got.Kind == "title", nil
}

// LeftTitle は、利用者の設定 settings で、ワークルームの名前 name から外れたセッションに書く名前。ok が false なら、利用者の設定が書くのを止めている
func (e *Engine) LeftTitle(settings json.RawMessage, name string) (title string, ok bool, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	var got struct {
		Kind  string `json:"kind"`
		Title string `json:"title"`
	}
	if err := json.Unmarshal([]byte(e.leftTitle(string(settings), name)), &got); err != nil {
		return "", false, err
	}
	return got.Title, got.Kind == "title", nil
}

// WorkroomActivities は、ワークルームの id の並び workrooms それぞれの作業の様子（working・idle・unknown）。作業はレコードから決まるので、レコードを引く口 src を渡す
func (e *Engine) WorkroomActivities(workrooms []string, src Source) (out map[string]string, err error) {
	b, err := json.Marshal(append([]string{}, workrooms...))
	if err != nil {
		return nil, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.source = src
	defer func() { e.source = nil }()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.activities(string(b))), &out)
	return out, err
}

// MyWorkdesk は、AI のワークルームの作業机（base の myWorkdeskIn）: ワークルームのフォルダの id（無ければ空）、ワーカーブックの id（まだ無ければ空）、参加の文に足す英語の文
type MyWorkdesk struct {
	Workrooms string `json:"workrooms"`
	Book      string `json:"book"`
	ForAI     string `json:"forAi"`
}

// MyWorkdesk は、ワークルーム workroom の作業机。folders は書庫のフォルダの行の全部。作業はレコードから決まるので、レコードを引く口 src を渡す
func (e *Engine) MyWorkdesk(workroom string, folders []json.RawMessage, src Source) (out MyWorkdesk, err error) {
	f, err := json.Marshal(append([]json.RawMessage{}, folders...))
	if err != nil {
		return out, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.source = src
	defer func() { e.source = nil }()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.myWorkdesk(workroom, string(f))), &out)
	return out, err
}

// IsAdminWorkroom は、ワークルーム（id）が、このホストの管理者のワークルームか（管理者の印が指す）。同じホストの管理者の AI 間メッセージに、利用者の頼みの印を付けるかを決める。
// 管理者の印はレコードから決まるので、レコードを引く口 src を渡す
func (e *Engine) IsAdminWorkroom(workroom string, src Source) (admin bool, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.source = src
	defer func() { e.source = nil }()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return e.isAdmin(workroom), nil
}
