package server

// 窓とのつながり: 窓をつなぐ・外す、窓が知らせる見え方、窓への知らせ、ブックを出す（Show）

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
	"time"
)

// 窓へ知らせを貯めておける数。超えた窓は切る（つなぎ直して読み直す）
const clientBuffer = 256

type event struct {
	name string
	data []byte
}

type client struct {
	id          string
	ch          chan event
	view        json.RawMessage     // 窓が知らせた、見ているもの（POST /api/view。まだ知らせが無ければ nil）
	focused     int64               // 最後にフォーカスされた順（大きいほど新しい。つないだときも 1 つ進める）
	viewSeq     int64               // 受けた見ているものの番号（窓が知らせるたびに増やす。古い番号の知らせは捨てる）
	shown       []string            // いまその窓に見えているブック（touched.go。新しく見えたブックだけを「開いた」とする。コントロールセンターがカレントスクリーンの間は空）
	held        []string            // いまその窓のブックスクリーンが開いているステージエントリ（ブックと、ブックの外のページの id。ページとフォルダの id は世界の中で重ならないので、id だけで持つ。隠れている物も含む。trash.go。AI はゴミ箱に入れられない）
	editLocks   map[string][]string // 利用者がその窓で直している物（ページかブックの id → その中の物の id の並び。editlock.go）
	recordLocks map[string][]string // 利用者がその窓で直しているレコード（対象の種類の id → レコードの id の並び。editlock.go）
}

// Join は窓をつなぎ、知らせの通り道を返す。最初の知らせは hello
func (h *Hub) Join() *client {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.next++
	h.ticks++
	c := &client{id: fmt.Sprintf("c%d", h.next), ch: make(chan event, clientBuffer), focused: h.ticks}
	h.clients[c.id] = c
	fmt.Fprintln(os.Stderr, stamp(), "window", c.id, "joined")
	hello := map[string]any{"client": c.id}
	if h.build != nil {
		hello["build"] = h.build
	}
	h.send(c, "hello", hello)
	return c
}

// Leave は窓を外す（窓が自分で閉じたか、つながりが切れた）。窓が加わる・外れる・切られるたびに、時刻と窓の id を常駐のログに書く
func (h *Hub) Leave(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c.id]; ok {
		fmt.Fprintln(os.Stderr, stamp(), "window", c.id, "left")
		h.drop(c)
	}
}

// drop は窓を外す: 知らせの通り道を閉じ、その窓が知らせた warning も消す（h.mu を持って呼ぶ）
func (h *Hub) drop(c *client) {
	delete(h.clients, c.id)
	delete(h.windowWarnings, c.id)
	close(c.ch)
}

// SetView は、窓が見ているものと、利用者が直している物 editLocks（ページかブックの id → その中の物の id の並び）を覚える（seq が受けたものより古ければ覚えない）。
// focused なら、その窓がいちばん新しくフォーカスされた窓になる
func (h *Hub) SetView(clientID string, view json.RawMessage, editLocks, recordLocks map[string][]string, focused bool, seq int64) bool {
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
	if !stale {
		c.editLocks = editLocks
		c.recordLocks = recordLocks
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

// View は、最後にフォーカスされた窓が見ているもの（つながっている窓が無い・まだ知らせが無ければ nil）
func (h *Hub) View() json.RawMessage {
	h.mu.Lock()
	defer h.mu.Unlock()
	if c := h.window(); c != nil {
		return c.view
	}
	return nil
}

// window は、見ているものを知らせた窓のうち、最後にフォーカスされたもの（無ければ nil。h.mu を持って呼ぶ）
func (h *Hub) window() *client {
	var last *client
	for _, c := range h.clients {
		if c.view != nil && (last == nil || c.focused > last.focused) {
			last = c
		}
	}
	return last
}

// WaitWindow は、見ているものを知らせた窓ができるまで d だけ待ち、できたか返す
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

// Show の頼み。Book は出すブック、Page は出すページ（Book が有り Page が空ならブックを開いたときのページ。Page だけなら、そのページを持っているブックをそのページで、
// どのブックにも入っていないページならブックの外のページを出す）。Stage は出すステージの id（空ならカレント）、Split なら、そのステージを分けて右にできたステージに出す
type Show struct {
	Book  string `json:"book,omitempty"`
	Page  string `json:"page,omitempty"`
	Stage string `json:"stage,omitempty"`
	Split bool   `json:"split,omitempty"`
	Mode  string `json:"mode,omitempty"` // print-preview なら印刷プレビューで出す（ブックだけ。画面がそのまま受ける）
}

// shownTo は、窓に知らせる、出す物: 確かめた頼みに、出す物の種類 To（book か、ブックの外のページの page）を添えた形
type shownTo struct {
	To string `json:"to"`
	Show
}

// Show で出せなかった理由
var (
	ErrNoBook         = errors.New("no-book")          // そのブックが無い（ブックもページも言わなかった）
	ErrNoPage         = errors.New("no-page")          // そのページが無い（言ったブックのページでない）
	ErrNoPrintPreview = errors.New("no-print-preview") // ブックの外のページは印刷プレビューで出せない
	ErrNoWindow       = errors.New("no-window")        // 窓がつながっていない
	ErrNoStage        = errors.New("no-stage")         // 窓にそのステージが無い
	ErrNoSplit        = errors.New("no-split")         // 窓がもう分けられない
)

// shownOf は、頼み s の出す物を確かめて、窓に知らせる形にする（Page だけの頼みは、そのページを持っているブックを添える。h.mu を持って呼ぶ）
func (h *Hub) shownOf(s Show) (shownTo, error) {
	to := shownTo{To: "book", Show: s}
	if s.Book != "" {
		if _, ok := h.books[s.Book]; !ok || h.outOfSight(s.Book) {
			return to, ErrNoBook
		}
		if s.Page != "" && h.bookOfPage(s.Page) != s.Book {
			return to, ErrNoPage
		}
		return to, nil
	}
	if s.Page == "" {
		return to, ErrNoBook
	}
	if book := h.bookOfPage(s.Page); book != "" {
		to.Book = book
		return to, nil
	}
	if h.entryNotInBook(s.Page) != s.Page {
		return to, ErrNoPage
	}
	if s.Mode == "print-preview" {
		return to, ErrNoPrintPreview
	}
	to.To, to.Mode = "page", ""
	return to, nil
}

// Show は、最後にフォーカスされた窓に、ブックかブックの外のページを出すように知らせる。
// ステージと分けられるかは、その窓が知らせた見ているもの（stages・canSplit）で確かめる
func (h *Hub) Show(s Show) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	to, err := h.shownOf(s)
	if err != nil {
		return err
	}
	c := h.window()
	if c == nil {
		return ErrNoWindow
	}
	var v struct {
		screen
		Hidden *screen `json:"hidden"`
	}
	_ = json.Unmarshal(c.view, &v)
	// コントロールセンターがカレントスクリーンの窓は、後ろに隠れているブックスクリーンのステージに出す（出すとブックスクリーンがカレントスクリーンになる）
	shown := v.screen
	if v.Hidden != nil {
		shown = *v.Hidden
	}
	ids := make([]string, 0, len(shown.Stages))
	for _, st := range shown.Stages {
		ids = append(ids, st.ID)
	}
	if s.Stage != "" && !slices.Contains(ids, s.Stage) {
		return ErrNoStage
	}
	if s.Split && !shown.CanSplit {
		return ErrNoSplit
	}
	h.send(c, "show", to)
	return nil
}

// CloseAll は全部の窓と、AI を起こす知らせの通り道を外す（常駐を止めるとき。知らせの通り道を閉じると、つながりが終わる）
func (h *Hub) CloseAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, c := range h.clients {
		h.drop(c)
	}
	for l := range h.wakeLines {
		h.closeWakesLocked(l)
	}
}

// broadcast は全部の窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) broadcast(name string, v any) {
	for _, c := range h.clients {
		h.send(c, name, v)
	}
}

// send は 1 つの窓に知らせる。貯まりきった窓は切る（h.mu を持って呼ぶ）
func (h *Hub) send(c *client, name string, v any) {
	data, _ := json.Marshal(v)
	select {
	case c.ch <- event{name, data}:
	default:
		fmt.Fprintln(os.Stderr, stamp(), "window", c.id, "is cut off: too many events waiting")
		h.drop(c)
	}
}
