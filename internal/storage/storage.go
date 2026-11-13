// Package storage は、常駐が持つブックと設定とアノテーションの置き場所。
//
// 置き場所は Storage の型 1 つにまとめ、SQLite（sqlite.go）はその実装の 1 つ。置き場所を替えても、常駐の API と画面は変わらない。
// ブックの中身は JSON のまま持ち、中を解釈しない（形を決めるのは画面と同じ core のスキーマ）。
package storage

import (
	"encoding/json"
	"errors"
)

// Book は、置いたブック 1 冊。Version は書くたびに 1 つ上がる（最初に書いたときが 1）
type Book struct {
	ID      string          `json:"id"`
	Body    json.RawMessage `json:"book"`
	Version int64           `json:"version"`
}

// Record は、置いたレコード 1 件（対象の定義が足した種類のデータ）。Version は書くたびに 1 つ上がる（最初に書いたときが 1）。中身は JSON のまま持ち、中を解釈しない
type Record struct {
	Subject string          `json:"subject"`
	ID      string          `json:"id"`
	Body    json.RawMessage `json:"record"`
	Version int64           `json:"version"`
}

// Counter は、番号を振る種類の、区切りごとの次の番号
type Counter struct {
	Subject string `json:"subject"`
	Scope   string `json:"scope"`
	Next    int64  `json:"next"`
}

// ErrConflict は、書くときに添えた版が、置いてある版と違うこと
var ErrConflict = errors.New("the book was changed by someone else")

// BookWrite は Batch の、ブック 1 冊の書き込み（PutBook と同じ。base が置いてある版と違えば ErrConflict）
type BookWrite struct {
	ID   string
	Body json.RawMessage
	Base int64
}

// RecordWrite は Batch の、レコード 1 件の書き込み（base が置いてある版と違えば ErrConflict。作るときの base は 0。Removed なら消す）。
// Keys は索引キーの値（名前 → 文字か数。値の無いキーは持たない）。種類が宣言した索引キー（SetKinds）の分だけを、中身とは別に置く
type RecordWrite struct {
	Subject string
	ID      string
	Body    json.RawMessage
	Base    int64
	Removed bool
	Keys    map[string]any
}

// KeySpec は索引キー 1 つの宣言: 名前と、値の型（text か number）
type KeySpec struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// KindSpec は、レコードの種類 1 つと、その索引キーの宣言（宣言の順）
type KindSpec struct {
	Subject string    `json:"subject"`
	Keys    []KeySpec `json:"keys"`
}

// Cond は索引キーの条件 1 つ。Op は eq・lt・gt（Value と比べる）か、absent（値が無い）・present（値がある）
type Cond struct {
	Key   string
	Op    string
	Value any
}

// Order は並び: 索引キー Key の小さい順（Desc なら大きい順）。同じ値と値の無いレコードは id の順で、値の無いレコードは後ろ
type Order struct {
	Key  string
	Desc bool
}

// Query はレコードの探し方: Where の全部に合う物を、Order の順（無ければ id の順）に、Limit 件まで（0 なら全部）。KeysOnly なら中身を読まない
type Query struct {
	Where    []Cond
	Order    *Order
	Limit    int
	KeysOnly bool
}

// Found は探して見つかったレコード 1 件: id と索引キーの値、中身（KeysOnly なら nil）と版
type Found struct {
	ID      string
	Body    json.RawMessage
	Version int64
	Keys    map[string]any
}

// ErrUnknownKey は、種類が宣言していない索引キーを条件か並びに書いたこと
var ErrUnknownKey = errors.New("the kind has no such index key")

// BookBody は Batch の、ブックごとの並び（アノテーション・AI 編集チケット）の置き換え（空の並びなら消す）
type BookBody struct {
	Book string
	Body json.RawMessage
}

// UserBody は Batch の、利用者ごとの物（設定）の置き換え
type UserBody struct {
	User string
	Body json.RawMessage
}

// SearchText は、言葉で探すための文字 1 件（Batch の、レコードとは別の並び）。Kind と Ref で 1 件を決め（Ref はレコードの id に限らない）、
// Title（題。本文より上に並べる）と Body（本文）を置き換える。Removed か、Title も Body も空なら消す
type SearchText struct {
	Kind, Ref   string
	Title, Body string
	Removed     bool
}

// Batch は 1 回の Perform が変える物の全部。Apply が、並びの順（ブック → 消すブック → 設定 → アノテーション → AI 編集チケット → レコード → 探す文字 → 番号の表）に 1 つのまとまりとして書く。
// 変えない物は nil（nil でない UserBody は置き換える）
type Batch struct {
	Books         []BookWrite
	Removed       []string
	Settings      *UserBody
	Annotations   []BookBody
	AIEditTickets []BookBody
	Records       []RecordWrite // 変えるレコード（1 つのアクションが変えた全部）
	SearchTexts   []SearchText  // 変える探す文字（レコードと同じ 1 回の書き込みで）
	Counters      []Counter     // 番号を進めた区切り（レコードを書くのと同じ 1 回の書き込みで）
}

// Storage はブックと設定とアノテーションの置き場所。設定は利用者ごとに、アノテーションはブックごとに持つ
type Storage interface {
	// Apply は b の全部を 1 つのまとまりとして書く。途中で 1 つでも失敗（版の違いも）したら、何も書かない。
	// 版が違うときは、ErrConflict と、そのときの置いてあるブック
	Apply(b Batch) (*Book, error)
	// Books は置いてある全部のブック（ゴミ箱のブックも）
	Books() ([]Book, error)
	// SetKinds は、今ある種類と索引キーの宣言を伝える。種類ごとに 1 つの表を持ち、宣言した索引キーを中身とは別の列に置く
	// （宣言が変わった種類は列を作り直す。値は FillKeys で入れ直すまで無い）。伝えられたことの無い種類のレコードは、中を解釈せずに 1 つの表に置いたまま
	SetKinds(kinds []KindSpec) error
	// FillKeys は、種類 subject の全部のレコードの索引キーの値を keys（レコードの id → 名前 → 値）にする（宣言が変わったあとに入れ直す）
	FillKeys(subject string, keys map[string]map[string]any) error
	// Record は種類 subject の id の 1 件（無ければ nil）
	Record(subject, id string) (*Record, error)
	// Find は種類 subject の、探し方 q に合うレコード。宣言に無い索引キーを書いたら ErrUnknownKey
	Find(subject string, q Query) ([]Found, error)
	// Records は置いてある全部のレコード（種類・id の順）、Counters は番号の表
	Records() ([]Record, error)
	Counters() ([]Counter, error)
	// SyncSearch は、探す文字を入れ直す: 種類 keep の全部を texts にし（texts に無い参照先は消す）、keep に無い種類の文字は消す
	SyncSearch(keep []string, texts []SearchText) error
	// Search は言葉で探す（SearchQuery）
	Search(q SearchQuery) (SearchResult, error)
	// DeleteBook はブック id と、それを開いた時刻と、そのアノテーションと AI 編集チケットを消す（戻せない）
	DeleteBook(id string) error
	// PutBook は、置いてある版が base のときだけ body で書き換え、新しい版を返す。base が 0 なら、まだ無いときだけ足す。
	// 違えば ErrConflict と、置いてあるブック
	PutBook(id string, body json.RawMessage, base int64) (int64, *Book, error)
	// Settings は利用者の設定（無ければ nil）
	Settings(user string) (json.RawMessage, error)
	PutSettings(user string, body json.RawMessage) error
	// ParticipantNotes は利用者の常駐だけが持つ参加者の記録（参加者の id → セッション id と、参加を伝えたかの印。JSON のまま。無ければ nil）。アクションを通さない記録
	ParticipantNotes(user string) (json.RawMessage, error)
	PutParticipantNotes(user string, body json.RawMessage) error
	// Annotations はブックの id ごとのアノテーションの並び（JSON のまま。1 つも無いブックは無い）
	Annotations() (map[string]json.RawMessage, error)
	// PutAnnotations はブック book のアノテーションの並びを body にする（空の並びなら消す）
	PutAnnotations(book string, body json.RawMessage) error
	// AIEditTickets はブックの id ごとの、AI 編集チケットの並び（JSON のまま。1 つも無いブックは無い）
	AIEditTickets() (map[string]json.RawMessage, error)
	// PutAIEditTickets はブック book の AI 編集チケットの並びを body にする（空の並びなら消す）
	PutAIEditTickets(book string, body json.RawMessage) error
	// Touched はブックの id ごとの、開いたか書いた時刻の新しい方（Stamp の形）。開いた時刻は、DB に無いブックにも残る
	Touched() (map[string]string, error)
	// RanOnce は、初めて起動したときに 1 度だけ行うアクション（runsOnceAtStart）のうち、行ったと記録した物の id、MarkRanOnce は 1 つ記録する
	RanOnce() (map[string]bool, error)
	MarkRanOnce(id string) error
	// Open は、ブック id を開いた時刻を at にする
	Open(id, at string) error
	Close() error
}
