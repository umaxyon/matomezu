package engine

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/dop251/goja"
)

// BulkAction は、アクションバルクの中のアクション 1 つ。IDs は振る id のもと（画面で先に行ったときの値。尽きたら新しく作る）
type BulkAction struct {
	Action string          `json:"action"`
	Args   json.RawMessage `json:"args"`
	On     *On             `json:"on,omitempty"`
	Lang   string          `json:"lang,omitempty"` // 画面で先に行ったときの言語（空ならエンジンが設定の言語の項目で決める）
	IDs    []string        `json:"ids,omitempty"`
	Now    string          `json:"now,omitempty"`   // 画面で先に行った時点（AI が頼んだときなどはホストが決める。無ければエンジンが決める）
	Today  string          `json:"today,omitempty"` // Now と同じ所が同じ時点から決めた、利用者の暦の日付（YYYY-MM-DD。無ければエンジンが Now の時点から決める）
}

// Input はアクションバルク 1 つの頼み。Actions を順に行い、全部通るか全部断る
type Input struct {
	Actions []BulkAction `json:"actions"`
	// Pages と Folders は、アクションの全部が要るブックのページとフォルダ（置き場所から読んだまま。アクションごとの、宛先のブックか、レコードが対象なら RecordNeeds の Books の和。
	// 宛先がブックに入っていないページなら、そのページの行か、それを持つバインダの行と中のページの行。
	// 一覧のアクションか、宛先が置き場所に無いアクションを含むなら、全部のブックと、ブックに入っていないページとバインダの全部）。
	// Folders には、ブックとバインダの行の後ろに、それらから書庫の一番上（書庫ホームか、ゴミ箱の中のブックならゴミ箱）までの、書庫ホーム・ゴミ箱・フォルダの行
	// （ブックごとに近い順。全部のときは、書庫ホーム・ゴミ箱と、ほかのフォルダの全部を id の順に）も入る
	Pages    []json.RawMessage `json:"pages"`
	Folders  []json.RawMessage `json:"folders"`
	Settings json.RawMessage   `json:"settings"`
	// Annotations は Pages のページのアノテーション（ページの id → 並び。アノテーションの有るページの分）
	Annotations map[string]json.RawMessage `json:"annotations,omitempty"`
	// Records は対象の定義が足した種類のレコード（種類の id → id → レコード。アクションごとの宛先のレコードの和）。Counters は対象の種類の、区切り → 次の番号（アクションごとの対象の種類の和）
	Records  map[string]map[string]json.RawMessage `json:"records,omitempty"`
	Counters map[string]map[string]int64           `json:"counters,omitempty"`
	// Actor は頼んだ者（無ければ利用者）。AI は入っているワークルームの id を Workroom に持つ（空なら参加が確定していない）
	Actor *Actor `json:"actor,omitempty"`
	// TimeoutSec は、アクションを待つ秒数（0 なら DefaultTimeoutSec。MaxTimeoutSec まで）。超えたら打ち切って断る
	TimeoutSec int `json:"-"`
	// Watched は、利用者が直している物（ブックの id → 物の id。編集ロック）。AI のアクションと lockedForUser のアクションが変えるか消すなら、エンジンが being-edited で断る
	Watched map[string][]string `json:"watched,omitempty"`
	// WatchedRecords は、利用者が直しているレコード（対象の種類の id → レコードの id）。レコードが対象のアクションにも同じ決まりで効く
	WatchedRecords map[string][]string `json:"watchedRecords,omitempty"`
}

// Actor は頼んだ者。Kind は "user" か "ai"、Workroom は AI が入っているワークルームの id（空なら確定していない）
type Actor struct {
	Kind     string `json:"kind"`
	Workroom string `json:"workroom,omitempty"`
	As       string `json:"as,omitempty"` // ビジターなら "visitor"（ワークルームは持たない。core の WireActor）
}

// On はアクションの宛先: ブックか、ページか、レコード（対象の定義が足した種類のデータ）のどれか
type On struct {
	Book   string `json:"book,omitempty"`
	Page   string `json:"page,omitempty"`
	Record string `json:"record,omitempty"`
}

// RecordChange は、アクションが変えたレコード 1 件。Record は新しいレコードか、消したなら "removed"（JSON の文字）
type RecordChange struct {
	Subject string          `json:"subject"`
	ID      string          `json:"id"`
	Record  json.RawMessage `json:"record"`
	Keys    map[string]any  `json:"keys,omitempty"`   // 索引キーの値（名前 → 文字か数。索引キーの無い種類と、消したレコードには無い）
	Search  *SearchText     `json:"search,omitempty"` // 横断検索に使う文字（searchTexts を持つ種類だけ。消したレコードには無い）
}

// RecordNeeds は、アクションが対象にする種類（レコードが対象でなければ空）と、読むだけのブックの id（アクションが引数から答える）
type RecordNeeds struct {
	Subject string   `json:"subject"`
	Books   []string `json:"books"`
}

// Output はアクションバルクを行った結果。断ったときは OK が false で Reason に理由、Detail に AI への説明（認可ステップが止めた denied なら、Permission にそのステップの id）、
// At に断られたアクションが何番目か（0 から）。変えた物は、アクションの全部を重ねた後の物（同じページ・フォルダ・レコードは 1 つ）。
// Books は変わった・足したブック、Removed は一覧から無くなったブック、Settings は変わった設定（変わらなければ空）、
// Annotations はアノテーションが変わったページの id → 新しい並び（空の並びなら全部無くなった）
type Output struct {
	OK            bool                        `json:"ok"`
	Reason        string                      `json:"reason,omitempty"`
	Permission    string                      `json:"permission,omitempty"`
	Detail        string                      `json:"detail,omitempty"`
	Kind          string                      `json:"kind,omitempty"`         // 断りの種類（アクションが添えた名前か、土台の種類。title-taken など）
	SystemFolder  string                      `json:"systemFolder,omitempty"` // 名前が重なる断り（title-taken）で、重なった相手がシステムフォルダのときの、その印（定義の id）
	At            *int                        `json:"at,omitempty"`           // 断られたアクションが何番目か（常駐のログにだけ使う）
	Result        json.RawMessage             `json:"result,omitempty"`       // 最後のアクションの結果
	Pages         []RowChange                 `json:"pages,omitempty"`        // 変わった・足した・無くなったページ
	Folders       []RowChange                 `json:"folders,omitempty"`      // 変わった・足した・無くなったフォルダ
	Created       []string                    `json:"created,omitempty"`      // そのうち新しく足したページ・フォルダの id（世界のどこにも無い id であること）
	Books         []string                    `json:"books,omitempty"`        // 変わったブックの id（変わったページ・フォルダを持つブック。無くなったブックも）
	Trashing      []string                    `json:"trashing,omitempty"`     // 新しくゴミ箱に入るブックの id
	Library       json.RawMessage             `json:"library,omitempty"`      // 書庫の履歴に入るアクションが変えたページとフォルダごとの、前と後（{"pages": {id: {"before", "after"}}, "folders": 同じ}。無い側は "none"。画面にそのまま知らせる）
	Settings      json.RawMessage             `json:"settings,omitempty"`
	Annotations   map[string]json.RawMessage  `json:"annotations,omitempty"`
	Records       []RecordChange              `json:"records,omitempty"`       // 変わったレコードの全部（宛先が先）。1 つのトランザクションで書く
	Counters      map[string]map[string]int64 `json:"counters,omitempty"`      // 番号を進めた種類の id → 区切り → 次の番号（進めた区切りだけ）
	Notice        string                      `json:"notice,omitempty"`        // AI への知らせ（可変ページの中身をずらして位置が変わったなど）
	AIEditTickets []AIEditTicketChange        `json:"aiEditTickets,omitempty"` // レコードが対象のアクションが返した、AI 編集チケットの変え方の並び（レコードと同じ 1 回の書き込みで、順に当てる）
	AIMessages    []AIMessage                 `json:"aiMessages,omitempty"`    // レコードが対象のアクションが返した、送る AI 間メッセージ（行ったのは参加の確定した AI。常駐が書き込みと一緒に送る）
}

// AIMessage は、アクションが送る AI 間メッセージ 1 通（Workroom は宛先のワークルームの id。送り手は行った参加者）
type AIMessage struct {
	Workroom    string `json:"workroom"`
	Text        string `json:"text"`
	NoRecipient string `json:"noRecipient,omitempty"` // 宛先がいないとき: refuse（空のとき）はバルクを断る、skip はその 1 通を送らない
}

// RowChange は、変わったページ・フォルダ 1 つ（Row は新しい本文。無くなったなら Removed）
type RowChange struct {
	ID      string          `json:"id"`
	Row     json.RawMessage `json:"row,omitempty"`
	Removed bool            `json:"removed,omitempty"`
}

// AIEditTicketChange は、アクションが返した AI 編集チケットの変え方。Subject はそれを返したアクションの対象の種類で、Key でその種類の中の 1 つを見分け（郵便の id など）、ブック Book の AI 編集チケットを
// 作る（open）・閉じる（closed）・失敗にする（failed。Changed は変わった・無くなった物の id）・郵便が消えたと記す（removed。
// Cause は消えたわけで、上限で消えた limit か、利用者が消した user）
type AIEditTicketChange struct {
	Subject string   `json:"subject"`
	Book    string   `json:"book"`
	Key     string   `json:"key"`
	Outcome string   `json:"outcome"`
	Changed []string `json:"changed,omitempty"`
	Cause   string   `json:"cause,omitempty"`
}

// DefaultTimeoutSec と MaxTimeoutSec は、アクションを待つ秒数の標準と上限。待つ間は Engine（と、その上の Hub）の鍵を持ったままなので、止まらない処理に全員が巻き込まれないよう上限を持つ
const (
	DefaultTimeoutSec = 5
	MaxTimeoutSec     = 60
)

// Perform はアクションを行う。in.TimeoutSec の間に終わらなければ、打ち切って断る（変更は反映しない）
func (e *Engine) Perform(in Input) (out Output, err error) { return e.PerformWith(in, nil) }

// Source は、アクションを行っている間にエンジンがレコードを引く口: 種類 subject の id の 1 件（無ければ false）と、
// 索引キーの条件 where（engine.js が渡す JSON の並び）に合うかもしれないレコード（id → 見つかった物。合わない物が混ざってよく、絞るのはエンジン）。
// 読む物を関数で宣言したアクションと、レコードが指す先・同じ種類のほかのレコードを引くのに使う
type Source interface {
	Record(subject, id string) (json.RawMessage, bool)
	Find(subject string, where json.RawMessage, keysOnly bool) map[string]SourceFound
}

// SourceFound は Source が探して見つけたレコード 1 件: 中身（keysOnly なら無い）と、置き場所が持っている索引キーの値
type SourceFound struct {
	Record json.RawMessage `json:"record,omitempty"`
	Keys   map[string]any  `json:"keys"`
}

// PerformWith は、レコードを引く口 src を渡して Perform する（src が nil なら、in の Records だけで行う）
func (e *Engine) PerformWith(in Input, src Source) (out Output, err error) {
	if in.TimeoutSec < 0 || in.TimeoutSec > MaxTimeoutSec {
		return Output{OK: false, Reason: "bad-args", Detail: fmt.Sprintf("timeoutSec must be 1 to %d", MaxTimeoutSec)}, nil
	}
	seconds := in.TimeoutSec
	if seconds == 0 {
		seconds = DefaultTimeoutSec
	}
	b, err := json.Marshal(in)
	if err != nil {
		return Output{}, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.source = src
	defer func() { e.source = nil }()
	timer := time.AfterFunc(time.Duration(seconds)*time.Second, func() { e.vm.Interrupt("timeout") })
	defer func() {
		timer.Stop()
		e.vm.ClearInterrupt()
	}()
	defer func() {
		if r := recover(); r != nil {
			var stopped *goja.InterruptedError
			if re, ok := r.(error); ok && errors.As(re, &stopped) {
				out, err = Output{OK: false, Reason: "refused", Detail: fmt.Sprintf("timed out after %d seconds; nothing was changed (timeoutSec up to %d lets a heavy action take longer)", seconds, MaxTimeoutSec)}, nil
				return
			}
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.perform(string(b))), &out); err != nil {
		return Output{}, err
	}
	return out, nil
}

// RunOnceActions は、常駐が初めて起動したときに 1 度だけ行うアクション（runsOnceAtStart）の id の並び
func (e *Engine) RunOnceActions() (ids []string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.once()), &ids)
	return ids, err
}

// RecordNeeds は、アクション action が対象にする種類（レコードが対象でなければ Subject が空）と、読むだけの種類と、
// 引数 args（perform の args の JSON。無ければ空）から答えた読むだけのブックの id を返す
func (e *Engine) RecordNeeds(action string, args json.RawMessage) (needs RecordNeeds, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.needs(action, string(args))), &needs)
	return needs, err
}
