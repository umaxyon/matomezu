package server

// Hub は常駐が持つ今の世界（ブックと設定とアノテーション）と、つながっている窓。
//
// アクションは 1 つずつ順に行い（鍵 mu）、変わったものを置き場所に書いてから、つながっている全部の窓に同じ順で知らせる。
// 窓は自分で先に行ったアクションを、知らせ（client と seq）で確かめる。
//
// /api/events のイベント（data は JSON）:
//
//	hello     {"client"} この接続の id。窓はアクションにこの id と、自分で振った順の番号 seq を添えて送る
//	book      {"book", "version", "client", "seq", "by", "act", "action"} ブックが変わった・足された（client と seq は変えたアクションのもの。窓の外からなら空。
//	          by は頼んだ物（"ai"・"window"・常駐が自分で行ったなら "host"）、act は 1 回の Perform の印で、同じ Perform が変えたブックは同じ act。action は行ったアクションの id）
//	settings  {"settings", "client", "seq"} 設定が変わった
//	annotations {"book", "annotations", "client", "seq"} ブックのアノテーションが変わった（並びが空なら全部無くなった）
//	mailbox   {"mailbox", "window", "client", "seq"} 郵便箱が変わった（郵便が届いた・既読になった・消えた）。window は最後にフォーカスされた窓
//	ack       {"seq", "ok", "reason"} 送った窓にだけ。そのアクションを行い終えた（断ったなら ok が false）。そのアクションの book・settings・annotations・mailbox・participants のあとに届く
//	record    {"subject", "id", "record"（消したなら "removed"）, "version", "counters", "client", "seq"} 対象の定義が足した種類のレコード 1 件が変わった（records.go）
//	show      {"book", "page", "stage", "split"} 最後にフォーカスされた窓にだけ。そのブックを出す（Show）
//	plugins   {"version"} 追加プラグインが変わった（plugins.go）。窓は読み直す
//	removed   {"book", "client", "seq"} ブックをゴミ箱から消した（trash.go）
//	participant-calls {"participant", "at"} 参加者の最後に呼ばれた時刻（join.go。30 秒以上あいたときだけ知らせる）
//	participant-ready {"participant"} 参加者が準備中でなくなった（フックが参加を伝えた、または join で MCP がセッション id を運んだ。join.go）
//	touched   {"book", "at"} ブックに触れた時刻（開いた・変えた。touched.go）
//	keep      {} keepAlive ごとに送る。窓は、これも含めて知らせが QUIET_MS（host-client/server.ts）届かなければ、黙って切れたとみてつなぎ直す

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"slices"
	"strconv"
	"sync"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/plugin"
	"github.com/umaxyon/matomezu/internal/storage"
)

// 窓へ知らせを貯めておける数。超えた窓は切る（つなぎ直して読み直す）
const clientBuffer = 256

// 覚えておく、行ったアクションの番号（key）の数。窓は答えが届かなかったアクションを同じ番号で送り直すので、同じ番号は二度行わない
const performedKeys = 1024

type entry struct {
	body    json.RawMessage
	version int64
	trashed bool // ゴミ箱のブックか（土台のフィールド trashed があるか。覚えるときに 1 度だけ読む）
}

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
	shown       []string            // いまその窓に見えているブック（touched.go。新しく見えたブックだけを「開いた」とする。コントロールセンターを前に出している間は空）
	held        []string            // いまその窓のブックスクリーンが開いているブック（隠れている物も含む。trash.go。AI はゴミ箱に入れられない）
	editLocks   map[string][]string // 利用者がその窓で直している物（ブックの id → 物の id の並び。editlock.go）
	recordLocks map[string][]string // 利用者がその窓で直しているレコード（対象の種類の id → レコードの id の並び。editlock.go）
}

// Hub は世界と窓をまとめる
type Hub struct {
	mu               sync.Mutex
	store            storage.Storage
	engine           *engine.Engine
	books            map[string]entry
	order            []string // 置いた順のブックの id（GET /api/data の並び）
	settings         json.RawMessage
	annotations      map[string]json.RawMessage        // ブックの id → アノテーションの並び（1 つも無いブックは持たない）
	mailbox          json.RawMessage                   // 利用者の郵便箱（郵便の並び。無ければ nil）
	roles            map[string]string                 // 常駐が読む種類の役（participants・workrooms）→ 対象の定義の id（records.go）
	recordTables     map[string]map[string]recordEntry // 対象の定義が足した種類のレコード（種類の id → id → レコード。records.go）
	counters         map[string]map[string]int64       // 番号を振る種類の、区切り → 次の番号（種類の id → 区切り → 次の番号。records.go）
	participantNotes map[string]participantNote        // 参加者の id → 常駐だけが持つ参加者の記録（join.go）
	joinMu           sync.Mutex                        // 参加の頼みを 1 つずつ受ける（join.go）
	goneTold         map[string]bool                   // 表に無い参加の id のうち、断られたと伝えたもの（join.go。残さない）
	clients          map[string]*client
	next             int
	ticks            int64            // フォーカスの順を振る数
	viewed           chan struct{}    // 窓が見ているものを知らせたら閉じて、作り直す（WaitWindow）
	plugins          []*plugin.Bundle // 足した追加プラグイン（plugins.go）
	pluginsVersion   int64            // 追加プラグインが変わるたびに進む
	// warning のあるブックの id → その warning（読めない W004〜W006・一部に無い物がある W007）。読めるかは今のプラグインで決まる値なので DB には残さず、
	// 起動したときとプラグインが変わったときに全部、ブックを書いたときにその 1 冊を確かめ直す
	bookWarnings map[string]engine.BookWarning
	// 効かないアノテーション（種類が無い W018・形が合わない W019）の warning の 1 行ずつ。起動したとき・プラグインが変わったとき・アノテーションを消したときに確かめ直す
	annotationWarnings []string
	// 効かない郵便（種類が無い W022・形が合わない W023）の warning の 1 行ずつ。起動したとき・プラグインが変わったとき・郵便箱が変わったときに確かめ直す
	mailWarnings []string
	// 効かないレコード（種類が無い W024・形が合わない W025）の warning の 1 行ずつ。起動したとき・プラグインが変わったとき・レコードが変わったときに確かめ直す（records.go）
	recordLines []string
	// 窓が見つけて知らせた warning（窓のつながりの id → warning の 1 行ずつ。warnings.go）。窓が離れたら消す
	windowWarnings map[string][]string
	touched        map[string]string         // ブックの id → 触れた時刻（touched.go）
	performed      map[string]Performed      // 最近行ったアクションの番号（Perform の Key）→ その結果
	performedOrder []string                  // performed の番号を行った順に（古いものから忘れる）
	acts           int64                     // 行ったアクションの数（book の知らせの act の後ろ。1 回の Perform が変えたブックに同じ印を付ける）
	actPrefix      string                    // book の知らせの act の前（起動ごとに違う値。起動し直しても、前の act と重ならない）
	aiEditTickets  map[string][]AIEditTicket // ブックの id → AI 編集チケット（ai_edit_tickets.go。1 つも無いブックは持たない）
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
	annotations, err := store.Annotations()
	if err != nil {
		return nil, err
	}
	mailbox, err := store.Mailbox(user)
	if err != nil {
		return nil, err
	}
	noteBody, err := store.ParticipantNotes(user)
	if err != nil {
		return nil, err
	}
	notes := map[string]participantNote{}
	if noteBody != nil {
		if err := json.Unmarshal(noteBody, &notes); err != nil {
			return nil, err
		}
	}
	stored, err := store.AIEditTickets()
	if err != nil {
		return nil, err
	}
	aiEditTickets := map[string][]AIEditTicket{}
	for id, body := range stored {
		var list []AIEditTicket
		if err := json.Unmarshal(body, &list); err != nil {
			return nil, fmt.Errorf("the AI edit tickets of book %s cannot be read: %w", id, err)
		}
		aiEditTickets[id] = list
	}
	h := &Hub{store: store, engine: eng, books: map[string]entry{}, settings: settings, annotations: annotations, mailbox: mailbox, participantNotes: notes, clients: map[string]*client{}, viewed: make(chan struct{}), bookWarnings: map[string]engine.BookWarning{}, windowWarnings: map[string][]string{}, touched: touched, performed: map[string]Performed{}, aiEditTickets: aiEditTickets, actPrefix: strconv.FormatInt(time.Now().UnixNano(), 36)}
	for _, b := range books {
		h.books[b.ID] = entry{b.Body, b.Version, trashed(b.Body)}
		h.order = append(h.order, b.ID)
	}
	if err := h.loadRecords(); err != nil {
		return nil, err
	}
	if err := h.loadRoles(); err != nil {
		return nil, err
	}
	if err := h.checkBooks(h.order); err != nil {
		return nil, err
	}
	if err := h.checkAnnotations(); err != nil {
		return nil, err
	}
	if err := h.checkMailbox(); err != nil {
		return nil, err
	}
	if err := h.checkRecords(); err != nil {
		return nil, err
	}
	return h, nil
}

// checkAnnotations は全部のアノテーションを今のプラグインで確かめ、効かないもの（種類が無い・形が合わない）の warning の一覧を直す。
// 新しい warning は常駐のログに書く（h.mu を持って呼ぶ）
func (h *Hub) checkAnnotations() error {
	pairs := []engine.AnnotatedBook{}
	for _, id := range h.order {
		if list, ok := h.annotations[id]; ok {
			pairs = append(pairs, engine.AnnotatedBook{Book: h.books[id].body, Annotations: list})
		}
	}
	lines := []string{}
	if len(pairs) > 0 {
		found, err := h.engine.CheckAnnotations(pairs)
		if err != nil {
			return err
		}
		lines = found
	}
	for _, line := range lines {
		if !slices.Contains(h.annotationWarnings, line) {
			fmt.Fprintln(os.Stderr, "warning:", line)
		}
	}
	h.annotationWarnings = lines
	return nil
}

// checkMailbox は郵便箱を今のプラグインで確かめ、効かない郵便の warning の一覧を直す。新しい warning は常駐のログに書く（h.mu を持って呼ぶ）
func (h *Hub) checkMailbox() error {
	lines, err := h.mailboxWarnings(h.mailbox)
	if err != nil {
		return err
	}
	h.recordMailWarnings(lines)
	return nil
}

// mailboxWarnings は郵便箱 mailbox を今のプラグインで確かめた、効かない郵便の warning の一覧（何も変えない）
func (h *Hub) mailboxWarnings(mailbox json.RawMessage) ([]string, error) {
	if len(mailbox) == 0 {
		return []string{}, nil
	}
	return h.engine.CheckMailbox(mailbox)
}

// recordMailWarnings は、郵便箱の warning の一覧を lines にする（新しい warning は常駐のログに書く。h.mu を持って呼ぶ）
func (h *Hub) recordMailWarnings(lines []string) {
	for _, line := range lines {
		if !slices.Contains(h.mailWarnings, line) {
			fmt.Fprintln(os.Stderr, "warning:", line)
		}
	}
	h.mailWarnings = lines
}

// putAnnotations は、ブック book のアノテーションの並びを書いて知らせる（空の並びなら消す。h.mu を持って呼ぶ）
func (h *Hub) putAnnotations(book string, body json.RawMessage, client string, seq int64) error {
	return h.putAnnotationLists(map[string]json.RawMessage{book: body}, client, seq)
}

// putAnnotationLists は、ブックごとのアノテーションの並び lists を 1 つのまとまりで書いて持ち、窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) putAnnotationLists(lists map[string]json.RawMessage, client string, seq int64) error {
	if len(lists) == 0 {
		return nil
	}
	batch := storage.Batch{}
	books := slices.Sorted(maps.Keys(lists))
	for _, book := range books {
		batch.Annotations = append(batch.Annotations, storage.BookBody{Book: book, Body: lists[book]})
	}
	if _, err := h.store.Apply(batch); err != nil {
		return err
	}
	for _, book := range books {
		h.applyAnnotations(book, lists[book], client, seq)
	}
	return nil
}

// applyAnnotations は、書き終えたブック book のアノテーションの並びを持ち、窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) applyAnnotations(book string, body json.RawMessage, client string, seq int64) {
	var list []json.RawMessage
	if json.Unmarshal(body, &list) == nil && len(list) == 0 {
		delete(h.annotations, book)
		body = json.RawMessage("[]")
	} else {
		h.annotations[book] = body
	}
	h.broadcast("annotations", map[string]any{"book": book, "annotations": body, "client": client, "seq": seq})
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
	h.recordWarnings(ids, found)
	return nil
}

// recordWarnings は、ブック ids を確かめた結果 found を一覧に持つ（変わった warning はログに書く。h.mu を持って呼ぶ）
func (h *Hub) recordWarnings(ids []string, found []engine.BookWarning) {
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

// Data は全部のブック（ゴミ箱のブックも）と設定とアノテーション（ブックの id → 並び）
func (h *Hub) Data() ([]storage.Book, json.RawMessage, map[string]json.RawMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	books := make([]storage.Book, 0, len(h.order))
	for _, id := range h.order {
		e := h.books[id]
		books = append(books, storage.Book{ID: id, Body: e.body, Version: e.version})
	}
	annotations := make(map[string]json.RawMessage, len(h.annotations))
	for id, list := range h.annotations {
		annotations[id] = list
	}
	return books, h.settings, annotations
}

// Mailbox は利用者の郵便箱（郵便の並び。届いていなければ空の並び）
func (h *Hub) Mailbox() json.RawMessage {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.mailbox == nil {
		return json.RawMessage("[]")
	}
	return h.mailbox
}

// AIBooks は、AI の MCP 公開ツールに出すブック（ゴミ箱のブックを除く）を、置いた順に返す
func (h *Hub) AIBooks() []storage.Book {
	h.mu.Lock()
	defer h.mu.Unlock()
	books := make([]storage.Book, 0, len(h.order))
	for _, id := range h.order {
		if e := h.books[id]; !e.trashed {
			books = append(books, storage.Book{ID: id, Body: e.body, Version: e.version})
		}
	}
	return books
}

// Perform の頼み。Client と Seq は送った窓とその番号（窓の外からなら空）。
// Key は窓がアクションごとに振る一意の番号（つなぎ直しても変えない）。同じ番号のアクションは二度行わない
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
	// TimeoutSec は、アクションを待つ秒数（省略は 5、上限 60）
	TimeoutSec int    `json:"timeoutSec,omitempty"`
	By         string `json:"-"` // 頼んだのが AI なら "ai"（AI の口だけが入れる。窓からは受けない）
	// Workroom は、頼んだのが AI のとき、入っているワークルームの id（参加が確定していなければ空。AI の口だけが入れる。窓からは受けない）
	Workroom string `json:"-"`
}

// Performed は行った結果（断ったら Detail に AI への説明。認可ステップが止めたら Permission にそのステップの id）
type Performed struct {
	OK         bool            `json:"ok"`
	Reason     string          `json:"reason,omitempty"`
	Permission string          `json:"permission,omitempty"`
	Detail     string          `json:"detail,omitempty"`
	Result     json.RawMessage `json:"result,omitempty"`
	Notice     string          `json:"notice,omitempty"` // AI への知らせ（可変ページの中身をずらして位置が変わったなど）
}

// Perform はアクションを行い、変わったものを書いて知らせる。行い終えた番号（Key）がまた届いたら、行わずに前の結果を返す（ack も送る）
func (h *Hub) Perform(p Perform) (Performed, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if done, ok := h.performed[p.Key]; ok && p.Key != "" {
		h.ack(p, done)
		return done, nil
	}
	in := engine.Input{Action: p.Action, Args: p.Args, On: p.On, Lang: p.Lang, IDs: p.IDs, Now: p.Now, Settings: h.settings, Mailbox: h.mailbox, Actor: actorOf(p), TimeoutSec: p.TimeoutSec}
	in.Annotations = map[string]json.RawMessage{}
	needs, err := h.engine.RecordNeeds(p.Action)
	if err != nil {
		return Performed{}, err
	}
	if needs.Subject != "" {
		// レコードが対象のアクションは、ブックもアノテーションも読まない
	} else if p.On != nil {
		if e, ok := h.books[p.On.Book]; ok {
			in.Books = []json.RawMessage{e.body}
		}
		if list, ok := h.annotations[p.On.Book]; ok {
			in.Annotations[p.On.Book] = list
		}
	} else {
		for _, id := range h.order {
			in.Books = append(in.Books, h.books[id].body)
		}
		for id, list := range h.annotations {
			in.Annotations[id] = list
		}
	}
	h.recordInputs(&in, needs, p.On)
	in.Watched = h.watched()
	in.WatchedRecords = h.watchedRecords()
	out, err := h.engine.Perform(in)
	if err != nil {
		return Performed{}, err
	}
	done := Performed{OK: out.OK, Reason: out.Reason, Permission: out.Permission, Detail: out.Detail, Result: out.Result, Notice: out.Notice}
	// AI のアクションは、窓に出ているブックをゴミ箱に入れない（AI は利用者に聞く）
	if out.OK && p.By == "ai" && h.trashesShown(out.Books) {
		done = Performed{OK: false, Reason: "open-on-screen"}
		out.OK = false
	}
	if out.OK {
		by := "host"
		if p.By == "ai" {
			by = "ai"
		} else if p.Client != "" {
			by = "window"
		}
		act := h.actPrefix + "-" + strconv.FormatInt(h.acts+1, 10)
		plan, err := h.planWrites(out, by, act, stamp())
		if err != nil {
			return Performed{}, err
		}
		// 変わった物の全部を 1 つのまとまりで書く。書けなければ、置き場所もメモリも窓も何も変わらず、行い直せる
		if _, err := h.store.Apply(plan.batch); err != nil {
			return Performed{}, err
		}
		h.acts++
		h.applyWrites(plan, out, p, by, act)
	}
	h.remember(p.Key, done)
	h.ack(p, done)
	return done, nil
}

// ack は、アクションを送った窓に行い終えたことを知らせる（h.mu を持って呼ぶ）
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

// Join は窓をつなぎ、知らせの通り道を返す。最初の知らせは hello
func (h *Hub) Join() *client {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.next++
	h.ticks++
	c := &client{id: fmt.Sprintf("c%d", h.next), ch: make(chan event, clientBuffer), focused: h.ticks}
	h.clients[c.id] = c
	fmt.Fprintln(os.Stderr, stamp(), "window", c.id, "joined")
	h.send(c, "hello", map[string]any{"client": c.id})
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

// SetView は、窓が見ているものと、利用者が直している物 editLocks（ブックの id → 物の id の並び）を覚える（seq が受けたものより古ければ覚えない）。
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

// Show の頼み。Stage は出すステージの id（空ならカレント）、Split なら、そのステージを分けて右にできたステージに出す。
// Page は出すページ（空ならブックを開いたときのページ）
type Show struct {
	Book  string `json:"book"`
	Page  string `json:"page,omitempty"`
	Stage string `json:"stage,omitempty"`
	Split bool   `json:"split,omitempty"`
	Mode  string `json:"mode,omitempty"` // print-preview なら印刷プレビューで出す（画面がそのまま受ける）
}

// Show で出せなかった理由
var (
	ErrNoBook   = errors.New("no-book")   // そのブックが無い
	ErrNoWindow = errors.New("no-window") // 窓がつながっていない
	ErrNoStage  = errors.New("no-stage")  // 窓にそのステージが無い
	ErrNoSplit  = errors.New("no-split")  // 窓がもう分けられない
)

// Show は、最後にフォーカスされた窓に、ブックを出すように知らせる。
// ステージと分けられるかは、その窓が知らせた見ているもの（stages・canSplit）で確かめる
func (h *Hub) Show(s Show) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if e, ok := h.books[s.Book]; !ok || e.trashed {
		return ErrNoBook
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
	// コントロールセンターを前に出している窓は、後ろに隠れているブックスクリーンのステージに出す（出すとブックスクリーンが前に出る）
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
	h.send(c, "show", s)
	return nil
}

// Book は 1 冊のブック（無いかゴミ箱のブックなら nil）
func (h *Hub) Book(id string) *storage.Book {
	h.mu.Lock()
	defer h.mu.Unlock()
	e, ok := h.books[id]
	if !ok || e.trashed {
		return nil
	}
	return &storage.Book{ID: id, Body: e.body, Version: e.version}
}

// AISettings は AI が読む設定（engine.AISettings）
func (h *Hub) AISettings() (json.RawMessage, error) {
	_, settings, _ := h.Data()
	return h.engine.AISettings(settings)
}

// AIItem は、ページの中の、id の物とその物と子の形の id の全部（engine.AIItem）
func (h *Hub) AIItem(page json.RawMessage, id string) (json.RawMessage, []string, bool, error) {
	return h.engine.AIItem(page, id)
}

// AICatalog は MCP 公開ツールの actions が返す物。ids が無ければ一覧の版と目次（今の warning を添える）、あれば ids の物の全文（engine.AICatalogIndex・AICatalogEntries）
func (h *Hub) AICatalog(ids []string) json.RawMessage {
	if len(ids) > 0 {
		return h.engine.AICatalogEntries(ids)
	}
	return withWarnings(h.engine.AICatalogIndex(), h.Warnings())
}

// CloseAll は全部の窓を外す（常駐を止めるとき。知らせの通り道を閉じると、窓とのつながりが終わる）
func (h *Hub) CloseAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, c := range h.clients {
		h.drop(c)
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

// AIMail は、利用者の郵便箱を、取り方 query で AI に見せる形にして返す（engine.AIMail）。
// 取り方が合わなければ、answer は空で、断る理由 reason を返す
func (h *Hub) AIMail(query engine.MailQuery) (answer json.RawMessage, reason string, err error) {
	return h.engine.AIMail(h.Mailbox(), query)
}

// actorOf は、Perform を頼んだ者を engine に渡す形にする（AI の口が入れた By と、入っているワークルームの id）
func actorOf(p Perform) *engine.Actor {
	if p.By == "ai" {
		return &engine.Actor{Kind: "ai", Workroom: p.Workroom}
	}
	return nil
}
