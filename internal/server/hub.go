package server

// Hub は常駐が持つ今の世界（ページとフォルダと設定とアノテーション）と、つながっている窓。
//
// アクションバルク（1 回の Perform）は 1 つずつ順に行い（鍵 mu）、変わったものを置き場所に 1 回で書いてから、つながっている全部の窓に同じ順で知らせる。
// 窓は自分で先に行ったアクションを、知らせ（client と seq）で確かめる。
//
// /api/events のイベント（data は JSON）:
//
//	hello     {"client"} この接続の id。窓はアクションバルクにこの id と、自分で振った順の番号 seq を添えて送る
//	changed   {"pages": [{"id", "page"（消したなら "removed": true）, "version"}], "folders": [{"id", "folder"（同じ）, "version"}], "books", "client", "seq", "by", "act", "actions",
//	          "settings"?, "annotations", "records": [{"subject", "id", "record"（消したなら "removed"）, "version"（消したなら 0）}], "counters"?, "window"}
//	          1 回の Perform が変えた物の全部（何か変わったときだけ 1 つ）。pages・folders は変えた・足した・消したページとフォルダ（書庫ホームとフォルダも）、
//	          books はそれらを持つブックの id（書庫ホームとフォルダは入らない）。
//	          client と seq は頼んだ窓とその番号（窓の外からなら空）。by は頼んだ物（"ai"・"window"・常駐が自分で行ったなら "host"）、act は 1 回の Perform の印、actions は行ったアクションの id の並び。
//	          settings は変わったときだけ、新しい設定。annotations はアノテーションが変わったページの id → 新しい並び（空の並びなら全部無くなった）。
//	          records は変えたレコード（郵便も。records.go）、counters は進めた番号の区切り（種類 → 区切り → 次の番号。進めたときだけ）。window は最後にフォーカスされた窓（無ければ空）
//	annotations {"page", "annotations", "client", "seq"} Perform の外でページのアノテーションが変わった（並びが空なら全部無くなった）
//	ack       {"seq", "ok", "reason"} 送った窓にだけ。そのアクションバルクを行い終えた（断ったなら ok が false）。そのバルクの changed のあとに届く
//	show      {"book", "page", "stage", "split"} 最後にフォーカスされた窓にだけ。そのブックを出す（Show）
//	plugins   {"version"} 追加プラグインが変わった（plugins.go）。窓は読み直す
//	participant-calls {"participant", "at"} 参加者の最後に呼ばれた時刻（join.go。30 秒以上あいたときだけ知らせる）
//	participant-ready {"participant"} 参加者が準備中でなくなった（フックが参加を伝えた、または join で MCP がセッション id を運んだ。join.go）
//	participant-live {"participant", "model", "branch"} 参加者のモデルかブランチが変わった（そのときの両方。空は省く。join.go・model.go）
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

// 覚えておく、行ったアクションバルクの番号（key）の数。窓は答えが届かなかったバルクを同じ番号で送り直すので、同じ番号は二度行わない
const performedKeys = 1024

// entry は、組んだブック 1 冊（tables.go。本文は、並びにページとバインダの中身ごと持つ形。version はブックのフォルダの版）
type entry struct {
	body    json.RawMessage
	version int64
	pages   []string // ブックのページの id（バインダの中も。覚えるときに 1 度だけ読む）
}

// newEntry は、ブックの本文 body を覚える形にする
func newEntry(body json.RawMessage, version int64) entry {
	return entry{body, version, pageIDs(body)}
}

// bookOfPage は、ページ page を持っているブックの id（ゴミ箱の中のブックのページ・どのブックにも入っていないページ・無いページなら空。h.mu を持って呼ぶ）
func (h *Hub) bookOfPage(page string) string {
	if _, ok := h.pages[page]; !ok {
		return ""
	}
	book := h.bookOfEntry(page)
	if h.inTrash(book) {
		return ""
	}
	return book
}

// bookOn は、宛先 on のアクションを行うブックの id（宛先がページなら、そのページを持っているブック。bookOfPage の決まり。h.mu を持って呼ぶ）
func (h *Hub) bookOn(on *engine.On) string {
	if on.Page != "" {
		return h.bookOfPage(on.Page)
	}
	return on.Book
}

// BookOn は、宛先 on のアクションを行うブックの id（bookOn と同じ決まり）
func (h *Hub) BookOn(on *engine.On) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.bookOn(on)
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
	editLocks   map[string][]string // 利用者がその窓で直している物（ページかブックの id → その中の物の id の並び。editlock.go）
	recordLocks map[string][]string // 利用者がその窓で直しているレコード（対象の種類の id → レコードの id の並び。editlock.go）
}

// Hub は世界と窓をまとめる
type Hub struct {
	mu               sync.Mutex
	store            storage.Storage
	engine           *engine.Engine
	pages            map[string]row       // ページの id → 本文と版（tables.go）
	folders          map[string]folderRow // フォルダの id → 本文と版と、エントリの id（tables.go）
	places           map[string]string    // エントリ（ページかバインダ）の id → それを入れているフォルダの id（tables.go）
	books            map[string]entry     // ブックの id → 組んだブック（pages と folders から組んだ物。変わったブックだけ組み直す）
	order            []string             // ブックの id の並び（AI に見せる一覧の順。読んだ順に、足したブックを後ろへ）
	settings         json.RawMessage
	annotations      map[string]json.RawMessage        // ページの id → アノテーションの並び（1 つも無いページは持たない）
	roles            map[string]string                 // 常駐が読む種類の役（participants・workrooms）→ 対象の定義の id（records.go）
	recordTables     map[string]map[string]recordEntry // 対象の定義が足した種類のレコード（種類の id → id → レコード。records.go）
	kinds            map[string]engine.Kind            // 今のプラグインのレコードの種類（種類の id → 索引キーの宣言と、AI に見せる一覧の決まり。records.go の syncKinds）
	counters         map[string]map[string]int64       // 番号を振る種類の、区切り → 次の番号（種類の id → 区切り → 次の番号。records.go）
	participantNotes map[string]participantNote        // 参加者の id → 常駐だけが持つ参加者の記録（join.go）
	joinMu           sync.Mutex                        // 参加の頼みを 1 つずつ受ける（join.go）
	goneTold         map[string]bool                   // 表に無い参加の id のうち、断られたと伝えたもの（join.go。残さない）
	heardModels      map[string]heardModel             // セッション id → 誰にも結ばれていないうちにフックが知らせたモデル（model.go。残さない）
	clients          map[string]*client
	wakeLines        map[*wakeLine]struct{} // AI を起こす知らせの通り道（watch.go）
	wakeQueue        map[string][]wakeItem  // 参加者の id → 受け取られるまで持つ、起こす知らせの行列（watch.go）
	wakeSeq          int64                  // 起こす知らせの番号の最後（watch.go）
	wakeLineSeq      int64                  // 起こす知らせの通り道の番号の最後（watch.go）
	seenEnvelopes    map[string]bool        // 行列に入れた AI 間メッセージの封筒の id（message.go。二度入れない）
	seenOrder        []string               // seenEnvelopes に入れた順（古い物から忘れる）
	next             int
	ticks            int64            // フォーカスの順を振る数
	viewed           chan struct{}    // 窓が見ているものを知らせたら閉じて、作り直す（WaitWindow）
	plugins          []*plugin.Bundle // 足した追加プラグイン（plugins.go）
	pluginsVersion   int64            // 追加プラグインが変わるたびに進む
	disabled         []string         // 利用者が有効にしていない追加プラグインの id（エンジンが無効で組んだ物）
	// warning のあるブックの id → そのブックの warning（ブックごと読めない W005・W006・一部に無い物がある W007）。読めるかは今のプラグインで決まる値なので DB には残さず、
	// 起動したときとプラグインが変わったときに全部、ブックを書いたときにその 1 冊を確かめ直す
	bookWarnings map[string]engine.BookWarning
	// 読めるブックの読めないページの id → その warning（W027〜W029。Book に持ち主のブック）。bookWarnings と同じときに、ブックごとに確かめ直す。
	// 読めないページの行はそのまま残し、書き換えない（perform_write.go の unreadableWrite）
	pageWarnings map[string]engine.BookWarning
	// 効かないアノテーション（種類が無い W018・形が合わない W019）の warning の 1 行ずつ。起動したとき・プラグインが変わったとき・アノテーションを消したときに確かめ直す
	annotationWarnings []string
	// 書庫の木の決まりが破れているときの warning の 1 行（W030。守っていれば空。tables.go の checkLibrary）
	libraryWarning string
	// 効かないレコード（種類が無い W024・形が合わない W025。郵便は種類が無い W022・形が合わない W023）の warning の 1 行ずつ（レコードごと）。
	// 起動したとき・プラグインが変わったときに全部、アクションがレコードを変えたときに変えたレコードだけを確かめ直す（records.go）
	recordLines map[recordKey][]string
	// 窓が見つけて知らせた warning（窓のつながりの id → warning の 1 行ずつ。warnings.go）。窓が離れたら消す
	windowWarnings map[string][]string
	touched        map[string]string    // ブックの id → 触れた時刻（touched.go）
	performed      map[string]Performed // 最近行ったアクションバルクの番号（Perform の Key）→ その結果
	performedOrder []string             // performed の番号を行った順に（古いものから忘れる）
	acts           int64                // 行ったアクションの数（changed の知らせの act の後ろ。1 回の Perform に 1 つの印）
	actPrefix      string               // changed の知らせの act の前（起動ごとに違う値。起動し直しても、前の act と重ならない）
	aiEditTickets  []AIEditTicket       // AI 編集チケットの全部（古い順。ai_edit_tickets.go）
}

// NewHub は置き場所から世界を読む
func NewHub(store storage.Storage, eng *engine.Engine) (*Hub, error) {
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
	var aiEditTickets []AIEditTicket
	if stored != nil {
		if err := json.Unmarshal(stored, &aiEditTickets); err != nil {
			return nil, fmt.Errorf("the AI edit tickets cannot be read: %w", err)
		}
	}
	h := &Hub{store: store, engine: eng, books: map[string]entry{}, settings: settings, annotations: annotations, participantNotes: notes, clients: map[string]*client{}, viewed: make(chan struct{}), bookWarnings: map[string]engine.BookWarning{}, pageWarnings: map[string]engine.BookWarning{}, windowWarnings: map[string][]string{}, touched: touched, performed: map[string]Performed{}, aiEditTickets: aiEditTickets, actPrefix: strconv.FormatInt(time.Now().UnixNano(), 36)}
	if err := h.loadTables(); err != nil {
		return nil, err
	}
	if err := h.loadRecords(); err != nil {
		return nil, err
	}
	if err := h.loadRoles(); err != nil {
		return nil, err
	}
	if err := h.syncKinds(); err != nil {
		return nil, err
	}
	h.runOnceActions()
	if err := h.checkBooks(h.order); err != nil {
		return nil, err
	}
	h.checkLibrary()
	if err := h.checkAnnotations(); err != nil {
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
		if lists := h.annotationsIn(id); len(lists) > 0 {
			pairs = append(pairs, engine.AnnotatedBook{Book: h.books[id].body, Annotations: lists})
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

// annotationsIn は、ブック book のページのうち、アノテーションの有るページの id → その並び（h.mu を持って呼ぶ）
func (h *Hub) annotationsIn(book string) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	for _, page := range h.books[book].pages {
		if list, ok := h.annotations[page]; ok {
			out[page] = list
		}
	}
	return out
}

// putAnnotations は、ページ page のアノテーションの並びを書いて知らせる（空の並びなら消す。h.mu を持って呼ぶ）
func (h *Hub) putAnnotations(page string, body json.RawMessage, client string, seq int64) error {
	return h.putAnnotationLists(map[string]json.RawMessage{page: body}, client, seq)
}

// putAnnotationLists は、ページごとのアノテーションの並び lists を 1 つのまとまりで書いて持ち、窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) putAnnotationLists(lists map[string]json.RawMessage, client string, seq int64) error {
	if len(lists) == 0 {
		return nil
	}
	batch := storage.Batch{}
	pages := slices.Sorted(maps.Keys(lists))
	for _, page := range pages {
		batch.Annotations = append(batch.Annotations, storage.PageBody{Page: page, Body: lists[page]})
	}
	if err := h.store.Apply(batch); err != nil {
		return err
	}
	for _, page := range pages {
		h.applyAnnotations(page, lists[page], client, seq)
	}
	return nil
}

// applyAnnotations は、書き終えたページ page のアノテーションの並びを持ち、窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) applyAnnotations(page string, body json.RawMessage, client string, seq int64) {
	body = h.holdAnnotations(page, body)
	h.broadcast("annotations", map[string]any{"page": page, "annotations": body, "client": client, "seq": seq})
}

// holdAnnotations は、書き終えたページ page のアノテーションの並びを持ち、窓に知らせる並びを返す（空の並びなら消して "[]"。h.mu を持って呼ぶ）
func (h *Hub) holdAnnotations(page string, body json.RawMessage) json.RawMessage {
	var list []json.RawMessage
	if json.Unmarshal(body, &list) == nil && len(list) == 0 {
		delete(h.annotations, page)
		return json.RawMessage("[]")
	}
	h.annotations[page] = body
	return body
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

// recordWarnings は、ブック ids を確かめた結果 found を一覧に持つ（ブックの warning と、読めないページの warning。変わった warning はログに書く。h.mu を持って呼ぶ）
func (h *Hub) recordWarnings(ids []string, found []engine.BookWarning) {
	before := map[string]bool{}
	for _, id := range ids {
		if n, ok := h.bookWarnings[id]; ok {
			before[n.Warning] = true
		}
		delete(h.bookWarnings, id)
	}
	for _, n := range h.pageWarnings {
		if slices.Contains(ids, n.Book) {
			before[n.Warning] = true
		}
	}
	h.dropPageWarnings(ids...)
	for _, n := range found {
		if n.Page != "" {
			h.pageWarnings[n.Page] = n
		} else {
			h.bookWarnings[n.Book] = n
		}
		if !before[n.Warning] {
			fmt.Fprintln(os.Stderr, "warning:", n.Warning)
			before[n.Warning] = true // 同じ理由の読めないページは同じ 1 行なので、1 回だけ書く
		}
	}
}

// dropPageWarnings は、ブック ids の読めないページの warning を一覧から外す（h.mu を持って呼ぶ）
func (h *Hub) dropPageWarnings(ids ...string) {
	for page, n := range h.pageWarnings {
		if slices.Contains(ids, n.Book) {
			delete(h.pageWarnings, page)
		}
	}
}

// BookWarnings は warning のあるブックの id → そのブックの warning（読めないページの warning は PageWarnings）
func (h *Hub) BookWarnings() map[string]engine.BookWarning {
	h.mu.Lock()
	defer h.mu.Unlock()
	return maps.Clone(h.bookWarnings)
}

// PageWarnings は、読めるブックの読めないページの id → その warning
func (h *Hub) PageWarnings() map[string]engine.BookWarning {
	h.mu.Lock()
	defer h.mu.Unlock()
	return maps.Clone(h.pageWarnings)
}

// UnreadablePage は、ページ id が読めないページなら、その理由の warning の番号（W027〜W029）
func (h *Hub) UnreadablePage(id string) (code string, ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	n, ok := h.pageWarnings[id]
	return n.Code, ok
}

// Data は設定とアノテーション（ページの id → 並び）。ページとフォルダは Tables
func (h *Hub) Data() (json.RawMessage, map[string]json.RawMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	annotations := make(map[string]json.RawMessage, len(h.annotations))
	for id, list := range h.annotations {
		annotations[id] = list
	}
	return h.settings, annotations
}

// Book は、組んだブック 1 冊（AI の口などに渡す。Version はブックのフォルダの版）
type Book struct {
	ID      string
	Body    json.RawMessage
	Version int64
}

// AIBooks は、AI の MCP 公開ツールに出すブック（ゴミ箱の中のブックを除く）を、並びの順に返す
func (h *Hub) AIBooks() []Book {
	h.mu.Lock()
	defer h.mu.Unlock()
	books := make([]Book, 0, len(h.order))
	for _, id := range h.order {
		if e := h.books[id]; !h.inTrash(id) {
			books = append(books, Book{ID: id, Body: e.body, Version: e.version})
		}
	}
	return books
}

// Perform の頼み: アクションバルク（Actions を順に行い、全部通るか全部断る）。Client と Seq は送った窓とその番号（窓の外からなら空）。
// Key は窓がバルクごとに振る一意の番号（つなぎ直しても変えない）。同じ番号のバルクは二度行わない
type Perform struct {
	Actions []engine.BulkAction `json:"actions"`
	Client  string              `json:"client,omitempty"`
	Seq     int64               `json:"seq,omitempty"`
	Key     string              `json:"key,omitempty"`
	// TimeoutSec は、バルクを待つ秒数（省略は 5、上限 60）
	TimeoutSec int    `json:"timeoutSec,omitempty"`
	By         string `json:"-"` // 頼んだのが AI なら "ai"（AI の口だけが入れる。窓からは受けない）
	// Workroom は、頼んだのが AI のとき、入っているワークルームの id（参加が確定していなければ空。AI の口だけが入れる。窓からは受けない）
	Workroom string `json:"-"`
}

// performOne は、アクション 1 つのバルクの頼み
func performOne(action string, args json.RawMessage, on *engine.On) Perform {
	return Perform{Actions: []engine.BulkAction{{Action: action, Args: args, On: on}}}
}

// ErrNoActions は、アクションが 1 つも無いバルク
var ErrNoActions = errors.New("a perform needs at least one action")

// Performed は行った結果（断ったら Detail に AI への説明。認可ステップが止めたら Permission にそのステップの id）
type Performed struct {
	OK         bool            `json:"ok"`
	Reason     string          `json:"reason,omitempty"`
	Permission string          `json:"permission,omitempty"`
	Detail     string          `json:"detail,omitempty"`
	Code       string          `json:"code,omitempty"` // 読めないページで断ったとき（reason unreadable）、読めない理由の warning の番号
	Result     json.RawMessage `json:"result,omitempty"`
	Notice     string          `json:"notice,omitempty"` // AI への知らせ（可変ページの中身をずらして位置が変わったなど）
}

// Perform はアクションバルクを行い、変わったものを 1 回で書いて知らせる。行い終えた番号（Key）がまた届いたら、行わずに前の結果を返す（ack も送る）
func (h *Hub) Perform(p Perform) (Performed, error) {
	if len(p.Actions) == 0 {
		return Performed{}, ErrNoActions
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if done, ok := h.performed[p.Key]; ok && p.Key != "" {
		h.ack(p, done)
		return done, nil
	}
	in := engine.Input{Actions: p.Actions, Settings: h.settings, Actor: actorOf(p), TimeoutSec: p.TimeoutSec}
	if err := h.performInputs(&in); err != nil {
		return Performed{}, err
	}
	in.Watched = h.watched()
	in.WatchedRecords = h.watchedRecords()
	out, err := h.engine.PerformWith(in, recordSource{h})
	if err != nil {
		return Performed{}, err
	}
	if !out.OK && out.At != nil && *out.At >= 0 && *out.At < len(p.Actions) {
		fmt.Fprintf(os.Stderr, "%s refused at the action %d of %d (%s): %s\n", stamp(), *out.At, len(p.Actions), p.Actions[*out.At].Action, out.Reason)
	}
	done := Performed{OK: out.OK, Reason: out.Reason, Permission: out.Permission, Detail: out.Detail, Code: out.Code, Result: out.Result, Notice: out.Notice}
	// AI のアクションは、窓に出ているブックをゴミ箱に入れない（AI は利用者に聞く）
	if out.OK && p.By == "ai" && h.trashesShown(out.Trashing) {
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
		// 窓のアクションで要求中の参加者が受け入れられた・断られたら、その AI に知らせる（watch.go。受け取られるまで行列で持つ）
		var requested map[string]bool
		if by == "window" {
			requested = h.requestedParticipants()
		}
		// アクションが返した AI 間メッセージは、送り手と全部の宛先に参加の確定した参加者がいるときだけ送る（いなければ、何も変えずにバルクごと断る）
		envelopes, refused := h.actionEnvelopes(out.AIMessages, p, time.Now())
		if refused != nil {
			h.remember(p.Key, *refused)
			h.ack(p, *refused)
			return *refused, nil
		}
		act := h.actPrefix + "-" + strconv.FormatInt(h.acts+1, 10)
		plan, err := h.planWrites(out, by, act, stamp())
		if err != nil {
			return Performed{}, err
		}
		if plan == nil || h.unreadableWrite(out) {
			// 新しく足すページ・フォルダの id が、世界にもう在る（エンジンが受けたブックの外に）か、読めないページの行を書き換える。何も変えずに断る
			done = Performed{OK: false, Reason: "refused"}
			h.remember(p.Key, done)
			h.ack(p, done)
			return done, nil
		}
		// 変わった物の全部を 1 つのまとまりで書く。書けなければ、置き場所もメモリも窓も何も変わらず、行い直せる
		if err := h.store.Apply(plan.batch); err != nil {
			return Performed{}, err
		}
		h.acts++
		h.applyWrites(plan, out, p, by, act)
		for _, e := range envelopes {
			h.deliver(e)
		}
		h.wakeOnParticipants(requested)
	}
	h.remember(p.Key, done)
	h.ack(p, done)
	return done, nil
}

// performInputs は、バルク in.Actions を行う前に、エンジンへ渡すページ・フォルダ・アノテーション・レコード・番号の表を in に入れる（h.mu を持って呼ぶ）。
// アクションごとに要るブック（レコードが対象なら引数から答えた読むだけのブック、宛先があればそのブック）の和と、そのアノテーションと、それらのブックから書庫の一番上までのフォルダを渡す。
// 宛先がブックに入っていないページなら、そのページ（バインダの中なら、そのバインダと中のページの全部）と、そのアノテーションと、そこから書庫ホームまでのフォルダを渡す。
// 一覧のアクション（宛先が無く、レコードが対象でない）か、0 番目でなく宛先が置き場所に無い（バルクの前のアクションが作ったページなど）アクションを含むなら、
// 全部のブックと、ブックに入っていないページとバインダの全部（ゴミ箱の中の物も）と、アノテーションの全部と、書庫ホーム・ゴミ箱・フォルダの全部
func (h *Hub) performInputs(in *engine.Input) error {
	all := false
	books := []string{}
	entries := []string{} // 宛先のページがブックに入っていないときの、渡すエントリ（そのページか、それを持つバインダ）
	add := func(id string) {
		if id != "" && !slices.Contains(books, id) {
			books = append(books, id)
		}
	}
	for i, step := range in.Actions {
		needs, err := h.engine.RecordNeeds(step.Action, step.Args)
		if err != nil {
			return err
		}
		switch {
		case needs.Subject != "":
			for _, id := range needs.Books {
				add(id)
			}
			h.recordInputs(in, needs, step.On)
		case step.On == nil:
			all = true
		default:
			// 宛先がページなら、そのページを持っているブック。ブックに入っていないページなら、そのページか、それを持つバインダ（entryNotInBook）。
			// 置き場所にあるが、ゴミ箱の中に在るページ（ゴミ箱の中のブックのページも）は、何も足さない。
			// 置き場所に無い宛先は、前のアクションが作った物でありうるので全部のブック。0 番目のアクションの宛先は前のアクションが作った物ではないので、何も足さない
			book := h.bookOn(step.On)
			_, known := h.pages[step.On.Page]
			switch {
			case book != "" && (step.On.Page != "" || h.hasBook(book)):
				add(book)
			case step.On.Page != "" && known:
				if e := h.entryNotInBook(step.On.Page); e != "" && !slices.Contains(entries, e) {
					entries = append(entries, e)
				}
			case i == 0:
			default:
				all = true
			}
		}
	}
	in.Annotations = map[string]json.RawMessage{}
	if all {
		in.Pages, in.Folders = h.rowsOf(append(slices.Clone(h.order), h.entriesNotInBooks()...))
		in.Folders = append(in.Folders, h.openRows()...)
		maps.Copy(in.Annotations, h.annotations)
		return nil
	}
	needed := append(slices.Clone(books), entries...)
	in.Pages, in.Folders = h.rowsOf(needed)
	in.Folders = append(in.Folders, h.openRowsAbove(needed)...)
	for _, id := range books {
		maps.Copy(in.Annotations, h.annotationsIn(id))
	}
	for _, id := range entries {
		pages := []string{id}
		if binder, ok := h.folders[id]; ok {
			pages = binder.entries
		}
		for _, page := range pages {
			if list, ok := h.annotations[page]; ok {
				in.Annotations[page] = list
			}
		}
	}
	return nil
}

// hasBook は、ブック id が置き場所にあるか（ゴミ箱の中のブックも。h.mu を持って呼ぶ）
func (h *Hub) hasBook(id string) bool {
	_, ok := h.books[id]
	return ok
}

// ack は、アクションバルクを送った窓に行い終えたことを知らせる（h.mu を持って呼ぶ）
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
	if _, ok := h.books[s.Book]; !ok || h.inTrash(s.Book) {
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

// Book は 1 冊のブック（無いかゴミ箱の中のブックなら nil）
func (h *Hub) Book(id string) *Book {
	h.mu.Lock()
	defer h.mu.Unlock()
	e, ok := h.books[id]
	if !ok || h.inTrash(id) {
		return nil
	}
	return &Book{ID: id, Body: e.body, Version: e.version}
}

// AISettings は AI が読む設定（engine.AISettings）
func (h *Hub) AISettings() (json.RawMessage, error) {
	settings, _ := h.Data()
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

// actorOf は、Perform を頼んだ者を engine に渡す形にする（AI の口が入れた By と、入っているワークルームの id）
func actorOf(p Perform) *engine.Actor {
	if p.By == "ai" {
		return &engine.Actor{Kind: "ai", Workroom: p.Workroom}
	}
	return nil
}
