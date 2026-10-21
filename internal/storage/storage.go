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

// ErrConflict は、書くときに添えた版が、置いてある版と違うこと
var ErrConflict = errors.New("the book was changed by someone else")

// Storage はブックと設定の置き場所。設定は利用者ごとに持つ
type Storage interface {
	// Books は置いてある全部のブック
	Books() ([]Book, error)
	// PutBook は、置いてある版が base のときだけ body で書き換え、新しい版を返す。base が 0 なら、まだ無いときだけ足す。
	// 違えば ErrConflict と、置いてあるブック
	PutBook(id string, body json.RawMessage, base int64) (int64, *Book, error)
	// Settings は利用者の設定（無ければ nil）
	Settings(user string) (json.RawMessage, error)
	PutSettings(user string, body json.RawMessage) error
	Close() error
}
