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
//	show      {"book", "page", "stage", "split"} 最後にフォーカスされた画面にだけ。そのブックを出す（Show）
//	plugins   {"version"} 追加プラグインが変わった（plugins.go）。画面は読み直す

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
	"sync"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/plugin"
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
	id      string
	ch      chan event
	view    json.RawMessage // 画面が知らせた、見ているもの（POST /api/view。まだ知らせが無ければ nil）
	focused int64           // 最後にフォーカスされた順（大きいほど新しい。つないだときも 1 つ進める）
}

// Hub は世界と画面をまとめる
type Hub struct {
	mu             sync.Mutex
	store          storage.Storage
	engine         *engine.Engine
	books          map[string]entry
	order          []string // 置いた順のブックの id（GET /api/data の並び）
	settings       json.RawMessage
	clients        map[string]*client
	next           int
	ticks          int64            // フォーカスの順を振る数
	viewed         chan struct{}    // 画面が見ているものを知らせたら閉じて、作り直す（WaitWindow）
	plugins        []*plugin.Bundle // 足した追加プラグイン（plugins.go）
	pluginsVersion int64            // 追加プラグインが変わるたびに進む
	// 読めないブックの id → その注意の 1 行。読めるかは今のプラグインで決まる値なので DB には残さず、
	// 起動したときとプラグインが変わったときに全部、ブックを書いたときにその 1 冊を確かめ直す
	unreadable map[string]string
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
	h := &Hub{store: store, engine: eng, books: map[string]entry{}, settings: settings, clients: map[string]*client{}, viewed: make(chan struct{}), unreadable: map[string]string{}}
	for _, b := range books {
		h.books[b.ID] = entry{b.Body, b.Version}
		h.order = append(h.order, b.ID)
	}
	if err := h.checkBooks(h.order); err != nil {
		return nil, err
	}
	return h, nil
}

// checkBooks は ids のブックを今のプラグインで確かめ、読めないブックの一覧を直す。新しく読めなくなった物は常駐のログに書く（h.mu を持って呼ぶ）
func (h *Hub) checkBooks(ids []string) error {
	bodies := make([]json.RawMessage, 0, len(ids))
	for _, id := range ids {
		if e, ok := h.books[id]; ok {
			bodies = append(bodies, e.body)
		}
	}
	found, err := h.engine.CheckBooks(bodies)
	if err != nil {
		return err
	}
	before := map[string]string{}
	for _, id := range ids {
		if n, ok := h.unreadable[id]; ok {
			before[id] = n
		}
		delete(h.unreadable, id)
	}
	for _, u := range found {
		h.unreadable[u.Book] = u.Notice
		if before[u.Book] != u.Notice {
			fmt.Fprintln(os.Stderr, "notice:", u.Notice)
		}
	}
	return nil
}

// Unreadable は読めないブックの id → その注意の 1 行
func (h *Hub) Unreadable() map[string]string {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make(map[string]string, len(h.unreadable))
	for id, n := range h.unreadable {
		out[id] = n
	}
	return out
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
	Now    string          `json:"now,omitempty"`
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
	in := engine.Input{Action: p.Action, Args: p.Args, On: p.On, Lang: p.Lang, IDs: p.IDs, Now: p.Now, Settings: h.settings}
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
	return h.checkBooks([]string{head.ID})
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
	if err := h.checkBooks([]string{id}); err != nil {
		return 0, nil, err
	}
	return version, nil, nil
}

// Join は画面をつなぎ、知らせの通り道を返す。最初の知らせは hello
func (h *Hub) Join() *client {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.next++
	h.ticks++
	c := &client{id: fmt.Sprintf("c%d", h.next), ch: make(chan event, clientBuffer), focused: h.ticks}
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

// SetView は、画面が見ているものを覚える。focused なら、その画面がいちばん新しくフォーカスされた画面になる
func (h *Hub) SetView(clientID string, view json.RawMessage, focused bool) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	c, ok := h.clients[clientID]
	if !ok {
		return false
	}
	if len(view) > 0 {
		c.view = view
		close(h.viewed)
		h.viewed = make(chan struct{})
	}
	if focused {
		h.ticks++
		c.focused = h.ticks
	}
	return true
}

// View は、最後にフォーカスされた画面が見ているもの（つながっている画面が無い・まだ知らせが無ければ nil）
func (h *Hub) View() json.RawMessage {
	h.mu.Lock()
	defer h.mu.Unlock()
	if c := h.window(); c != nil {
		return c.view
	}
	return nil
}

// window は、見ているものを知らせた画面のうち、最後にフォーカスされたもの（無ければ nil。h.mu を持って呼ぶ）
func (h *Hub) window() *client {
	var last *client
	for _, c := range h.clients {
		if c.view != nil && (last == nil || c.focused > last.focused) {
			last = c
		}
	}
	return last
}

// WaitWindow は、見ているものを知らせた画面ができるまで d だけ待ち、できたか返す
func (h *Hub) WaitWindow(d time.Duration) bool {
	deadline := time.After(d)
	for {
		h.mu.Lock()
		ok, viewed := h.window() != nil, h.viewed
		h.mu.Unlock()
		if ok {
			return true
		}
		select {
		case <-viewed:
		case <-deadline:
			return false
		}
	}
}

// Show の頼み。Stage は出すステージの id（空ならカレント）、Split なら、そのステージを分けて右にできたステージに出す。
// Page は出すページ（空ならブックを開いたときのページ）
type Show struct {
	Book  string `json:"book"`
	Page  string `json:"page,omitempty"`
	Stage string `json:"stage,omitempty"`
	Split bool   `json:"split,omitempty"`
}

// Show で出せなかった理由
var (
	ErrNoBook   = errors.New("no-book")   // そのブックが無い
	ErrNoWindow = errors.New("no-window") // 画面がつながっていない
	ErrNoStage  = errors.New("no-stage")  // 画面にそのステージが無い
	ErrNoSplit  = errors.New("no-split")  // 画面がもう分けられない
)

// Show は、最後にフォーカスされた画面に、ブックを出すように知らせる。
// ステージと分けられるかは、その画面が知らせた見ているもの（stages・canSplit）で確かめる
func (h *Hub) Show(s Show) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.books[s.Book]; !ok {
		return ErrNoBook
	}
	c := h.window()
	if c == nil {
		return ErrNoWindow
	}
	var v struct {
		Stages []struct {
			ID string `json:"id"`
		} `json:"stages"`
		CanSplit bool `json:"canSplit"`
	}
	_ = json.Unmarshal(c.view, &v)
	ids := make([]string, 0, len(v.Stages))
	for _, st := range v.Stages {
		ids = append(ids, st.ID)
	}
	if s.Stage != "" && !slices.Contains(ids, s.Stage) {
		return ErrNoStage
	}
	if s.Split && !v.CanSplit {
		return ErrNoSplit
	}
	h.send(c, "show", s)
	return nil
}

// Book は 1 冊のブック（無ければ nil）
func (h *Hub) Book(id string) *storage.Book {
	h.mu.Lock()
	defer h.mu.Unlock()
	e, ok := h.books[id]
	if !ok {
		return nil
	}
	return &storage.Book{ID: id, Body: e.body, Version: e.version}
}

// Lang は利用者の設定の言語（無ければ空。core が決める）
func (h *Hub) Lang() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	var s struct {
		Lang string `json:"lang"`
	}
	_ = json.Unmarshal(h.settings, &s)
	return s.Lang
}

// AICatalog は AI 向けの機能台帳（engine.AICatalog）
func (h *Hub) AICatalog() json.RawMessage {
	return h.engine.AICatalog()
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
