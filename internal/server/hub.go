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
//	removed   {"book", "client", "seq"} ブックをゴミ箱から消した（trash.go）

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

// 覚えておく、行ったアクションの番号（key）の数。画面は答えが届かなかったアクションを同じ番号で送り直すので、同じ番号は二度行わない
const performedKeys = 1024

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
	viewSeq int64           // 受けた見ているものの番号（画面が知らせるたびに増やす。古い番号の知らせは捨てる）
	shown   []string        // いまその画面に出ているブック（touched.go。新しく出たブックだけを「開いた」とする）
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
	// warning のあるブックの id → その warning（読めない W004〜W006・一部に無い物がある W007）。読めるかは今のプラグインで決まる値なので DB には残さず、
	// 起動したときとプラグインが変わったときに全部、ブックを書いたときにその 1 冊を確かめ直す
	bookWarnings map[string]engine.BookWarning
	// 画面が見つけて知らせた warning（画面のつながりの id → warning の 1 行ずつ。warnings.go）。画面が離れたら消す
	screenWarnings map[string][]string
	touched        map[string]string    // ブックの id → 触れた時刻（touched.go）
	performed      map[string]Performed // 最近行ったアクションの番号（Perform の Key）→ その結果
	performedOrder []string             // performed の番号を行った順に（古いものから忘れる）
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
	touched, err := store.Touched()
	if err != nil {
		return nil, err
	}
	h := &Hub{store: store, engine: eng, books: map[string]entry{}, settings: settings, clients: map[string]*client{}, viewed: make(chan struct{}), bookWarnings: map[string]engine.BookWarning{}, screenWarnings: map[string][]string{}, touched: touched, performed: map[string]Performed{}}
	for _, b := range books {
		h.books[b.ID] = entry{b.Body, b.Version}
		h.order = append(h.order, b.ID)
	}
	if err := h.checkBooks(h.order); err != nil {
		return nil, err
	}
	return h, nil
}

// checkBooks は ids のブックを今のプラグインで確かめ、warning のあるブックの一覧を直す。新しい warning は常駐のログに書く（h.mu を持って呼ぶ）
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
		if n, ok := h.bookWarnings[id]; ok {
			before[id] = n.Warning
		}
		delete(h.bookWarnings, id)
	}
	for _, n := range found {
		h.bookWarnings[n.Book] = n
		if before[n.Book] != n.Warning {
			fmt.Fprintln(os.Stderr, "warning:", n.Warning)
		}
	}
	return nil
}

// BookWarnings は warning のあるブックの id → その warning
func (h *Hub) BookWarnings() map[string]engine.BookWarning {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make(map[string]engine.BookWarning, len(h.bookWarnings))
	for id, n := range h.bookWarnings {
		out[id] = n
	}
	return out
}

// Data は全部のブック（ゴミ箱のブックも）と設定
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

// Perform の頼み。Client と Seq は送った画面とその番号（画面の外からなら空）。
// Key は画面がアクションごとに振る一意の番号（つなぎ直しても変えない）。同じ番号のアクションは二度行わない
type Perform struct {
	Action string          `json:"action"`
	Args   json.RawMessage `json:"args"`
	On     *engine.On      `json:"on,omitempty"`
	Lang   string          `json:"lang"`
	IDs    []string        `json:"ids,omitempty"`
	Now    string          `json:"now,omitempty"`
	Client string          `json:"client,omitempty"`
	Seq    int64           `json:"seq,omitempty"`
	Key    string          `json:"key,omitempty"`
	By     string          `json:"-"` // 頼んだのが AI なら "ai"（AI の口だけが入れる。画面からは受けない）
}

// Performed は行った結果
type Performed struct {
	OK     bool            `json:"ok"`
	Reason string          `json:"reason,omitempty"`
	Result json.RawMessage `json:"result,omitempty"`
}

// Perform はアクションを行い、変わったものを書いて知らせる。行い終えた番号（Key）がまた届いたら、行わずに前の結果を返す（ack も送る）
func (h *Hub) Perform(p Perform) (Performed, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if done, ok := h.performed[p.Key]; ok && p.Key != "" {
		h.ack(p, done)
		return done, nil
	}
	in := engine.Input{Action: p.Action, Args: p.Args, On: p.On, Lang: p.Lang, IDs: p.IDs, Now: p.Now, Settings: h.settings, By: p.By}
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
	// AI のアクションは、窓に出ているブックをゴミ箱に入れない（AI は利用者に聞く）
	if out.OK && p.By == "ai" && h.trashesShown(out.Books) {
		done = Performed{OK: false, Reason: "open-on-screen"}
		out.OK = false
	}
	if out.OK {
		for _, body := range out.Books {
			if err := h.putBook(body, p.Client, p.Seq); err != nil {
				return Performed{}, err
			}
		}
		for _, id := range out.Removed {
			if err := h.remove(id, p.Client, p.Seq); err != nil {
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
	h.remember(p.Key, done)
	h.ack(p, done)
	return done, nil
}

// ack は、アクションを送った画面に行い終えたことを知らせる（h.mu を持って呼ぶ）
func (h *Hub) ack(p Perform, done Performed) {
	if c, ok := h.clients[p.Client]; ok {
		h.send(c, "ack", map[string]any{"seq": p.Seq, "ok": done.OK, "reason": done.Reason})
	}
}

// remember は、行い終えたアクションの番号と結果を覚える。performedKeys を超えたら古いものから忘れる（h.mu を持って呼ぶ）
func (h *Hub) remember(key string, done Performed) {
	if key == "" {
		return
	}
	h.performed[key] = done
	h.performedOrder = append(h.performedOrder, key)
	if len(h.performedOrder) > performedKeys {
		delete(h.performed, h.performedOrder[0])
		h.performedOrder = h.performedOrder[1:]
	}
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
	h.touch(head.ID, stamp())
	return h.checkBooks([]string{head.ID})
}

// ErrConflict は、置いてある版が添えた版と違うこと
var ErrConflict = storage.ErrConflict

// UnreadableError は、書こうとしたブックが今の機能台帳で読めない（warning W004〜W006）ので書かなかったこと
type UnreadableError struct{ Warning string }

func (e UnreadableError) Error() string { return "unreadable: " + e.Warning }

// PutBook はブックを丸ごと置く（読み込みなど、アクションを通さない入口）。置いてある版が base のときだけ書き、知らせる
func (h *Hub) PutBook(id string, body json.RawMessage, base int64) (int64, *storage.Book, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	// 読めないブック（タイプが無い・形に合わない・決まりを守らない）は書かない。一部のプラグインが無いだけ（W007）なら書く
	found, err := h.engine.CheckBooks([]json.RawMessage{body})
	if err != nil {
		return 0, nil, err
	}
	for _, n := range found {
		if n.Unreadable() {
			return 0, nil, UnreadableError{n.Warning}
		}
	}
	version, have, err := h.store.PutBook(id, body, base)
	if errors.Is(err, storage.ErrConflict) || err != nil {
		return 0, have, err
	}
	if _, ok := h.books[id]; !ok {
		h.order = append(h.order, id)
	}
	h.books[id] = entry{body, version}
	h.broadcast("book", map[string]any{"book": body, "version": version})
	h.touch(id, stamp())
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
		delete(h.screenWarnings, c.id)
		close(c.ch)
	}
}

// SetView は、画面が見ているものを覚える（seq が受けたものより古ければ覚えない）。focused なら、その画面がいちばん新しくフォーカスされた画面になる
func (h *Hub) SetView(clientID string, view json.RawMessage, focused bool, seq int64) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	c, ok := h.clients[clientID]
	if !ok {
		return false
	}
	// 知らせは届く順が入れ替わることがあるので、受けたものより古い番号の見ているものは捨てる（番号 0 は比べない）
	stale := seq > 0 && seq <= c.viewSeq
	if seq > c.viewSeq {
		c.viewSeq = seq
	}
	if len(view) > 0 && !stale {
		c.view = view
		h.opened(c, view)
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

// WaitLatest は、最後にフォーカスされた窓がまだ見ているものを知らせていなければ（開いた直後など）、知らせるまで待つ。
// 知らせが来たら起きる（くり返し見に行かない）。d は上限で、過ぎたら待たずに戻る（そのときは知らせた窓のうち最後のものが選ばれる）
func (h *Hub) WaitLatest(d time.Duration) {
	deadline := time.After(d)
	for {
		h.mu.Lock()
		pending, viewed := h.latestPending(), h.viewed
		h.mu.Unlock()
		if !pending {
			return
		}
		select {
		case <-viewed:
		case <-deadline:
			return
		}
	}
}

// latestPending は、最後にフォーカスされた窓が、見ているものをまだ知らせていないか（h.mu を持って呼ぶ）
func (h *Hub) latestPending() bool {
	var last *client
	for _, c := range h.clients {
		if last == nil || c.focused > last.focused {
			last = c
		}
	}
	return last != nil && last.view == nil
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
	if e, ok := h.books[s.Book]; !ok || trashed(e.body) {
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

// Book は 1 冊のブック（無いかゴミ箱のブックなら nil）
func (h *Hub) Book(id string) *storage.Book {
	h.mu.Lock()
	defer h.mu.Unlock()
	e, ok := h.books[id]
	if !ok || trashed(e.body) {
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

// AICatalog は MCP 公開ツールの actions が返す物（engine.AICatalog）
func (h *Hub) AICatalog() json.RawMessage {
	return withWarnings(h.engine.AICatalog(), h.Warnings())
}

// CloseAll は全部の画面を外す（常駐を止めるとき。知らせの通り道を閉じると、画面とのつながりが終わる）
func (h *Hub) CloseAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, c := range h.clients {
		delete(h.clients, id)
		delete(h.screenWarnings, id)
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
