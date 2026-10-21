package server

// Hub は常駐が持つ今の世界（ブックと設定）と、つながっている画面。
//
// アクションは 1 つずつ順に行い（鍵 mu）、変わったものを置き場所に書いてから、つながっている全部の画面に同じ順で知らせる。
// 画面は自分で先に行ったアクションを、知らせ（client と seq）で確かめる。
//
// /api/events のイベント（data は JSON）:
//
//	hello     {"client"} この接続の id。画面はアクションにこの id と、自分で振った順の番号 seq を添えて送る
//	book      {"book", "version", "client", "seq"} ブックが変わった・足された（client と seq は変えたアクションのもの。画面の外からなら空）
//	settings  {"settings", "client", "seq"} 設定が変わった
//	ack       {"seq", "ok", "reason"} 送った画面にだけ。そのアクションを行い終えた（断ったなら ok が false）。そのアクションの book・settings のあとに届く

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// 画面へ知らせを貯めておける数。超えた画面は切る（つなぎ直して読み直す）
const clientBuffer = 256

type entry struct {
	body    json.RawMessage
	version int64
}

type event struct {
	name string
	data []byte
}

type client struct {
	id string
	ch chan event
}

// Hub は世界と画面をまとめる
type Hub struct {
	mu       sync.Mutex
	store    storage.Storage
	engine   *engine.Engine
	books    map[string]entry
	order    []string // 置いた順のブックの id（GET /api/data の並び）
	settings json.RawMessage
	clients  map[string]*client
	next     int
}

// NewHub は置き場所から世界を読む
func NewHub(store storage.Storage, eng *engine.Engine) (*Hub, error) {
	books, err := store.Books()
	if err != nil {
		return nil, err
	}
	settings, err := store.Settings(user)
	if err != nil {
		return nil, err
	}
	h := &Hub{store: store, engine: eng, books: map[string]entry{}, settings: settings, clients: map[string]*client{}}
	for _, b := range books {
		h.books[b.ID] = entry{b.Body, b.Version}
		h.order = append(h.order, b.ID)
	}
	return h, nil
}

// Data は全部のブックと設定
func (h *Hub) Data() ([]storage.Book, json.RawMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	books := make([]storage.Book, 0, len(h.order))
	for _, id := range h.order {
		e := h.books[id]
		books = append(books, storage.Book{ID: id, Body: e.body, Version: e.version})
	}
	return books, h.settings
}

// Perform の頼み。Client と Seq は送った画面とその番号（画面の外からなら空）
type Perform struct {
	Action string          `json:"action"`
	Args   json.RawMessage `json:"args"`
	On     *engine.On      `json:"on,omitempty"`
	Lang   string          `json:"lang"`
	IDs    []string        `json:"ids,omitempty"`
	Client string          `json:"client,omitempty"`
	Seq    int64           `json:"seq,omitempty"`
}

// Performed は行った結果
type Performed struct {
	OK     bool            `json:"ok"`
	Reason string          `json:"reason,omitempty"`
	Result json.RawMessage `json:"result,omitempty"`
}

// Perform はアクションを行い、変わったものを書いて知らせる
func (h *Hub) Perform(p Perform) (Performed, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	in := engine.Input{Action: p.Action, Args: p.Args, On: p.On, Lang: p.Lang, IDs: p.IDs, Settings: h.settings}
	if p.On != nil {
		if e, ok := h.books[p.On.Book]; ok {
			in.Books = []json.RawMessage{e.body}
		}
	} else {
		for _, id := range h.order {
			in.Books = append(in.Books, h.books[id].body)
		}
	}
	out, err := h.engine.Perform(in)
	if err != nil {
		return Performed{}, err
	}
	done := Performed{OK: out.OK, Reason: out.Reason, Result: out.Result}
	if out.OK {
		for _, body := range out.Books {
			if err := h.putBook(body, p.Client, p.Seq); err != nil {
				return Performed{}, err
			}
		}
		if len(out.Settings) > 0 {
			if err := h.store.PutSettings(user, out.Settings); err != nil {
				return Performed{}, err
			}
			h.settings = out.Settings
			h.broadcast("settings", map[string]any{"settings": out.Settings, "client": p.Client, "seq": p.Seq})
		}
	}
	if c, ok := h.clients[p.Client]; ok {
		h.send(c, "ack", map[string]any{"seq": p.Seq, "ok": done.OK, "reason": done.Reason})
	}
	return done, nil
}

// putBook は、アクションが変えたブックを今の版の上に書いて知らせる（h.mu を持って呼ぶ）
func (h *Hub) putBook(body json.RawMessage, client string, seq int64) error {
	var head struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &head); err != nil || head.ID == "" {
		return fmt.Errorf("the engine gave a book without an id: %s", body)
	}
	have, ok := h.books[head.ID]
	version, _, err := h.store.PutBook(head.ID, body, have.version)
	if err != nil {
		return err
	}
	if !ok {
		h.order = append(h.order, head.ID)
	}
	h.books[head.ID] = entry{body, version}
	h.broadcast("book", map[string]any{"book": body, "version": version, "client": client, "seq": seq})
	return nil
}

// ErrConflict は、置いてある版が添えた版と違うこと
var ErrConflict = storage.ErrConflict

// PutBook はブックを丸ごと置く（読み込みなど、アクションを通さない入口）。置いてある版が base のときだけ書き、知らせる
func (h *Hub) PutBook(id string, body json.RawMessage, base int64) (int64, *storage.Book, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	version, have, err := h.store.PutBook(id, body, base)
	if errors.Is(err, storage.ErrConflict) || err != nil {
		return 0, have, err
	}
	if _, ok := h.books[id]; !ok {
		h.order = append(h.order, id)
	}
	h.books[id] = entry{body, version}
	h.broadcast("book", map[string]any{"book": body, "version": version})
	return version, nil, nil
}

// Join は画面をつなぎ、知らせの通り道を返す。最初の知らせは hello
func (h *Hub) Join() *client {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.next++
	c := &client{id: fmt.Sprintf("c%d", h.next), ch: make(chan event, clientBuffer)}
	h.clients[c.id] = c
	h.send(c, "hello", map[string]any{"client": c.id})
	return c
}

// Leave は画面を外す
func (h *Hub) Leave(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c.id]; ok {
		delete(h.clients, c.id)
		close(c.ch)
	}
}

// CloseAll は全部の画面を外す（常駐を止めるとき。知らせの通り道を閉じると、画面とのつながりが終わる）
func (h *Hub) CloseAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, c := range h.clients {
		delete(h.clients, id)
		close(c.ch)
	}
}

// broadcast は全部の画面に知らせる（h.mu を持って呼ぶ）
func (h *Hub) broadcast(name string, v any) {
	for _, c := range h.clients {
		h.send(c, name, v)
	}
}

// send は 1 つの画面に知らせる。貯まりきった画面は切る（h.mu を持って呼ぶ）
func (h *Hub) send(c *client, name string, v any) {
	data, _ := json.Marshal(v)
	select {
	case c.ch <- event{name, data}:
	default:
		delete(h.clients, c.id)
		close(c.ch)
	}
}
