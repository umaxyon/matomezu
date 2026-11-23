package engine

import (
	"encoding/json"
	"fmt"
	"time"
)

// JoinActions は、AI が参加を頼むときに行うアクションの id（参加者を作る Participant）と、要求をキャンセルとして終えるアクションの id（Cancel。無ければ空）
type JoinActions struct {
	Participant string `json:"participant"`
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

// ParticipantAlive は、参加者が時点 now で生きているか（最後に呼ばれた時刻 calledAt は RFC 3339 の文字。空なら呼ばれていない。利用者の設定 settings の参加の有効時間で決まる）
func (e *Engine) ParticipantAlive(settings json.RawMessage, calledAt string, now time.Time) (alive bool, err error) {
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
	return e.alive(string(settings), calledAt, float64(now.UnixMilli())), nil
}

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
