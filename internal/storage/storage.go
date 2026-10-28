// Package storage は、常駐が持つブックと設定の置き場所。
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

// Trashed は、ゴミ箱のブック 1 冊。At はゴミ箱に入れた時刻（Stamp の形）
type Trashed struct {
	Book
	At string `json:"at"`
}

// ErrNotTrashed は、ゴミ箱にそのブックが無いこと
var ErrNotTrashed = errors.New("the book is not in the trash")

// ErrConflict は、書くときに添えた版が、置いてある版と違うこと
var ErrConflict = errors.New("the book was changed by someone else")

// Storage はブックと設定の置き場所。設定は利用者ごとに持つ
type Storage interface {
	// Books は置いてある全部のブック（ゴミ箱のブックは除く）
	Books() ([]Book, error)
	// Trash は、ブック id をゴミ箱に入れる（時刻 at を残す。置いていないブックなら何もしない）
	Trash(id, at string) error
	// TrashedBooks はゴミ箱の全部のブック（入れた時刻の新しい順）
	TrashedBooks() ([]Trashed, error)
	// Restore は、ゴミ箱のブック id を戻して返す（ゴミ箱に無ければ ErrNotTrashed）
	Restore(id string) (*Book, error)
	// Purge は、ゴミ箱のブック id を消す（戻せない。開いた時刻も消す。ゴミ箱に無ければ ErrNotTrashed）
	Purge(id string) error
	// PutBook は、置いてある版が base のときだけ body で書き換え、新しい版を返す。base が 0 なら、まだ無いときだけ足す。
	// 違えば ErrConflict と、置いてあるブック
	PutBook(id string, body json.RawMessage, base int64) (int64, *Book, error)
	// Settings は利用者の設定（無ければ nil）
	Settings(user string) (json.RawMessage, error)
	PutSettings(user string, body json.RawMessage) error
	// Touched はブックの id ごとの、開いたか書いた時刻の新しい方（Stamp の形）。開いた時刻は、DB に無いブック（1 冊だけのタイプのブック）にも残る
	Touched() (map[string]string, error)
	// Open は、ブック id を開いた時刻を at にする
	Open(id, at string) error
	Close() error
}
