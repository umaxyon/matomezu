// Package storage は、常駐が持つページとフォルダと設定とアノテーションの置き場所。
//
// 置き場所は Storage の型 1 つにまとめ、SQLite（sqlite.go）はその実装の 1 つ。置き場所を替えても、常駐の API と画面は変わらない。
// ページとフォルダの中身は JSON のまま持ち、中を解釈しない（形を決めるのは画面と同じ core のスキーマ）。
// ブックは、ブックのフォルダと、その下のバインダとページ（フォルダが、エントリの id を順に持つ）。どのエントリがどのフォルダに入っているかは、
// 中身とは別の表（Entries）にも持ち、エントリの id を主キーにして「エントリは、ちょうど 1 つのフォルダに入る」を守る
package storage

import (
	"encoding/json"
	"errors"
)

// Page は、置いたページ 1 枚。Version は書くたびに 1 つ上がる（最初に書いたときが 1）
type Page struct {
	ID      string          `json:"id"`
	Body    json.RawMessage `json:"page"`
	Version int64           `json:"version"`
}

// Folder は、置いたフォルダ 1 つ（ブックのフォルダか、バインダ）。Version は書くたびに 1 つ上がる（最初に書いたときが 1）
type Folder struct {
	ID      string          `json:"id"`
	Body    json.RawMessage `json:"folder"`
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
var ErrConflict = errors.New("it was changed by someone else")

// RowWrite は Batch の、ページ 1 枚かフォルダ 1 つの書き込み（base が置いてある版と違えば ErrConflict。作るときの base は 0 で、まだ無いときだけ。Removed なら消す）
type RowWrite struct {
	ID      string
	Body    json.RawMessage
	Base    int64
	Removed bool
}

// EntryPut は Batch の、エントリ（ページかバインダ）の入っているフォルダの書き込み: エントリ ID は、フォルダ Folder に入っている（Folder が空なら、どこにも入っていない = 表から消す）。
// 同じエントリを 2 つのフォルダに入れる書き込みは、主キーが断る（先に、出て行くフォルダの分を消す）
type EntryPut struct {
	ID     string
	Folder string
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

// PageBody は Batch の、ページごとの並び（アノテーション）の置き換え（空の並びなら消す）
type PageBody struct {
	Page string
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

// Batch は 1 回の Perform が変える物の全部。Apply が、並びの順（ページ → フォルダ → エントリの入っているフォルダ → 消したブック → 設定 → アノテーション → AI 編集チケット → レコード → 探す文字 → 番号の表）に 1 つのまとまりとして書く。
// 変えない物は nil（nil でない UserBody は置き換える）
type Batch struct {
	Pages         []RowWrite
	Folders       []RowWrite
	Entries       []EntryPut // 入っているフォルダが変わったエントリ（足した・消した・動かした）。消す分（Folder が空）を先に、入れる分を後に当てる
	RemovedBooks  []string   // 消したブックの id（そのブックを開いた時刻を消す。ページとフォルダは Pages・Folders に Removed で並べる）
	Settings      *UserBody
	Annotations   []PageBody
	AIEditTickets json.RawMessage // AI 編集チケットの並びの全部（置き換える。空の並びなら消す。変えないなら nil）
	Records       []RecordWrite   // 変えるレコード（1 回の Perform が変えた全部）
	SearchTexts   []SearchText    // 変える探す文字（レコードと同じ 1 回の書き込みで）
	Counters      []Counter       // 番号を進めた区切り（レコードを書くのと同じ 1 回の書き込みで）
}

// Storage はページとフォルダと設定とアノテーションの置き場所。設定は利用者ごとに、アノテーションはページごとに持つ
type Storage interface {
	// Apply は b の全部を 1 つのまとまりとして書く。途中で 1 つでも失敗（版の違いも）したら、何も書かない。版が違うときは ErrConflict
	Apply(b Batch) error
	// Pages は置いてある全部のページ、Folders は全部のフォルダ（どちらも id の順。ゴミ箱のブックの分も）
	Pages() ([]Page, error)
	Folders() ([]Folder, error)
	// Entries は、エントリ（ページかバインダ）の id → それを入れているフォルダの id
	Entries() (map[string]string, error)
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
	// Settings は利用者の設定（無ければ nil）
	Settings(user string) (json.RawMessage, error)
	// ParticipantNotes は利用者の常駐だけが持つ参加者の記録（参加者の id → セッション id と、参加を伝えたかの印。JSON のまま。無ければ nil）。アクションを通さない記録
	ParticipantNotes(user string) (json.RawMessage, error)
	PutParticipantNotes(user string, body json.RawMessage) error
	// Annotations はページの id ごとのアノテーションの並び（JSON のまま。1 つも無いページは無い）
	Annotations() (map[string]json.RawMessage, error)
	// AIEditTickets は、AI 編集チケットの並びの全部（JSON のまま。1 つも無ければ nil）
	AIEditTickets() (json.RawMessage, error)
	// PutAIEditTickets は、AI 編集チケットの並びの全部を body にする（空の並びなら消す）
	PutAIEditTickets(body json.RawMessage) error
	// Touched は、フォルダの id ごとの、開いたか書いた時刻の新しい方（Stamp の形）。書いた時刻は、そのフォルダと、その下（バインダの中まで）のページとフォルダを書いた時刻。
	// 開いた時刻は、置き場所に無い id にも残る
	Touched() (map[string]string, error)
	// RanOnce は、初めて起動したときに 1 度だけ行うアクション（runsOnceAtStart）のうち、行ったと記録した物の id、MarkRanOnce は 1 つ記録する
	RanOnce() (map[string]bool, error)
	MarkRanOnce(id string) error
	// PutAsset はアセットを置く（同じ id がもう在れば何もしない。中身で決まる id なので、在れば同じ物）
	PutAsset(a Asset) error
	// Asset は id のアセット（中身も。無ければ nil）
	Asset(id string) (*Asset, error)
	// AssetIDs は置いてある全部のアセットの id、RemoveAssets は ids のアセットを消す
	AssetIDs() ([]string, error)
	RemoveAssets(ids []string) error
	// Open は、ブック id を開いた時刻を at にする
	Open(id, at string) error
	Close() error
}
