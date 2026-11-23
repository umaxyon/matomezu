package server

// Hub は常駐が持つ今の世界（ページとフォルダと設定とアノテーション）と、つながっている窓。
//
// アクションバルク（1 回の Perform）は 1 つずつ順に行い（鍵 mu）、変わったものを置き場所に 1 回で書いてから、つながっている全部の窓に同じ順で知らせる。
// 窓は自分で先に行ったアクションを、知らせ（client と seq）で確かめる。
//
// /api/events のイベント（data は JSON）:
//
//	hello     {"client", "build"} この接続の id と、常駐の版とデータの形（{"version", "dataVersion"}。SetBuild の前は無い）。窓はアクションバルクにこの id と、自分で振った順の番号 seq を添えて送る
//	changed   {"pages": [{"id", "page"（消したなら "removed": true）, "version"}], "folders": [{"id", "folder"（同じ）, "version"}], "books", "library"?, "client", "seq", "by", "act", "actions",
//	          "settings"?, "annotations", "records": [{"subject", "id", "record"（消したなら "removed"）, "version"（消したなら 0）}], "counters"?, "window"}
//	          1 回の Perform が変えた物の全部（何か変わったときだけ 1 つ）。pages・folders は変えた・足した・消したページとフォルダ（書庫ホームとフォルダも）、
//	          books はそれらを持つブックの id（書庫ホームとフォルダは入らない）。library は、書庫の履歴に入るアクションが変えたページとフォルダごとの前と後（{"pages": {id: {"before", "after"}}, "folders": 同じ}。無い側は "none"）。
//	          client と seq は頼んだ窓とその番号（窓の外からなら空）。by は頼んだ物（"ai"・"window"・常駐が自分で行ったなら "host"）、act は 1 回の Perform の印、actions は行ったアクションの id の並び。
//	          settings は変わったときだけ、新しい設定。annotations はアノテーションが変わったページの id → 新しい並び（空の並びなら全部無くなった）。
//	          records は変えたレコード（郵便も。records.go）、counters は進めた番号の区切り（種類 → 区切り → 次の番号。進めたときだけ）。window は最後にフォーカスされた窓（無ければ空）
//	annotations {"page", "annotations"} Perform の外でページのアノテーションが変わった（並びが空なら全部無くなった）
//	ack       {"seq", "ok", "reason"} 送った窓にだけ。そのアクションバルクを行い終えた（断ったなら ok が false）。そのバルクの changed のあとに届く
//	show      {"book", "page", "stage", "split"} 最後にフォーカスされた窓にだけ。そのブックを出す（Show）
//	plugins   {"version"} 追加プラグインが変わった（plugins.go）。窓は読み直す
//	participant-calls {"participant", "at"} 参加者の最後に呼ばれた時刻（join_calls.go。30 秒以上あいたときだけ知らせる）
//	participant-ready {"participant"} 参加者が準備中でなくなった（フックが参加を伝えた、または join で MCP がセッション id を運んだ。join_session.go）
//	participant-live {"participant", "model", "branch"} 参加者のモデルかブランチが変わった（そのときの両方。空は省く。join.go・model.go）
//	touched   {"book", "at"} ブックに触れた時刻（開いた・変えた。touched.go）
//	update-status {"state", "version", "latest"?, "checkedAt"?, "askedAt"?} 新しい版の確かめの結果が変わった（update.go）
//	host-status {"hostId", "name", "osHostName", "open", "port"?, "addrs"?, "wsl"?, "failed"?} ホストどうしの入口の様子が変わった（hosts.go）
//	keep      {} keepAlive ごとに送る。窓は、これも含めて知らせが QUIET_MS（host-client/server.ts）届かなければ、黙って切れたとみてつなぎ直す

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/plugin"
	"github.com/umaxyon/matomezu/internal/storage"
)

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
	if h.outOfSight(book) || h.inUnreadable(page) {
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

// Hub は世界と窓をまとめる
type Hub struct {
	mu               sync.Mutex
	updateMu         sync.Mutex                   // 新しい版の確かめ（update・latest）の鍵。聞いている間は持たない
	update           UpdateStatus                 // 新しい版の確かめの結果（update.go）
	latest           LatestFunc                   // 新しい版を聞く口（無ければ確かめない）
	entrance         atomic.Pointer[hostEntrance] // ホストどうしの入口（hosts.go。SetHostEntrance の前は nil）
	build            *Build                       // 常駐の版とデータの形（hello で窓に知らせる。SetBuild）
	command          atomic.Pointer[string]       // 利用者が端末で打つ matomezu の名前（command.go）
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
	participantNotes map[string]participantNote        // 参加者の id → 常駐だけが持つ参加者の記録（join.go。結ぶのは join_session.go、呼ばれたのは join_calls.go）
	joinMu           sync.Mutex                        // 参加の頼みを 1 つずつ受ける（join.go）
	rejoin           rejoinPasses                      // 開発用の、前もって承認した再参加（rejoin_pass.go。リリースの実行ファイルには無い）
	gone             map[string]goneState              // 表に無い参加の id の、断り・キャンセルの伝え方（join_calls.go・watch.go。残さない）
	heardModels      map[string]heardModel             // セッション id → 誰にも結ばれていないうちにフックが知らせたモデル（model.go。残さない）
	clients          map[string]*client
	wakeLines        map[*wakeLine]struct{} // AI を起こす知らせの通り道（watch.go）
	wakeQueue        map[string][]wakeItem  // 参加者の id → 受け取られるまで持つ、起こす知らせの行列（watch.go）
	wakeSeq          int64                  // 起こす知らせの番号の最後（watch.go）
	wakeLineSeq      int64                  // 起こす知らせの通り道の番号の最後（watch.go）
	lentWakes        []string               // 通り道に貸した知らせの文の、新しい物（watch.go の WokenBy が照らす）
	seenEnvelopes    map[string]bool        // 行列に入れた AI 間メッセージの封筒の id（message.go。二度入れない）
	seenOrder        []string               // seenEnvelopes に入れた順（古い物から忘れる）
	next             int
	actionNow        time.Time        // 前に、時点の無いアクションに入れた時点（Perform。時計が後ろへ戻っても、これより後にする）
	ticks            int64            // フォーカスの順を振る数
	viewed           chan struct{}    // 窓が見ているものを知らせたら閉じて、作り直す（WaitWindow）
	plugins          []*plugin.Bundle // 足した追加プラグイン（plugins.go）
	pluginsVersion   int64            // 追加プラグインが変わるたびに進む
	disabled         []string         // 利用者が有効にしていない追加プラグインの id（エンジンが無効で組んだ物）
	// warning のあるブックの id → そのブックの warning（ブックごと読めない W005・W006・読めないページを持つ W027〜W029・一部に無い物がある W007）。読めるかは今のプラグインで決まる値なので DB には残さず、
	// 起動したときとプラグインが変わったときに全部、ブックを書いたときにその 1 冊を確かめ直す
	bookWarnings map[string]engine.BookWarning
	// warning のあるブックの外のページの id → その warning の 1 行（読めるが機能台帳に無い物を持つ W007）。起動したときとプラグインが変わったときに全部、
	// ページを書いたとき・ブックの外のページになったときにそのページを確かめ直し、ブックの外のページでなくなったら外す
	pageWarnings map[string]string
	// 効かないアノテーション（種類が無い W018・形が合わない W019）の warning の、付いているページの id → 1 行ずつ。起動したとき・プラグインが変わったとき・
	// ゴミ箱や読めない物のフォルダから物が出たときに全部、warning の有るページのアノテーションを書いたときにそのページを確かめ直す（holdAnnotations）
	annotationWarnings map[string][]string
	// 書庫の木の決まりが破れているときの warning の 1 行（W030。守っていれば空。tables.go の checkLibrary）
	libraryWarning string
	// unreadableWarning は、読めない物のフォルダに物が在れば、その warning（W032）の 1 行（無ければ空。unreadable.go）
	unreadableWarning string
	// settleWarning は、書庫を整える（読めない物を移す・戻す）のに失敗している間の warning（W033）の 1 行（失敗していなければ空。unreadable.go）
	settleWarning string
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
	// 今の機能台帳のシステムフォルダの定義の id → AI に見せる名前（英語。read_folder の名前。起動したときとプラグインが変わったときに読み直す）
	systemFolderTitles map[string]string
}

// Build は、常駐の版と、書くデータの形の番号。窓は開いたときの物と、つなぎ直したときの物を比べ、違えば読み直しを促す
type Build struct {
	Version     string `json:"version"`
	DataVersion int    `json:"dataVersion"`
}

// SetBuild は、hello で窓に知らせる常駐の版とデータの形を入れる
func (h *Hub) SetBuild(b Build) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.build = &b
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
	h := &Hub{store: store, engine: eng, books: map[string]entry{}, pageWarnings: map[string]string{}, settings: settings, annotations: annotations, participantNotes: notes, clients: map[string]*client{}, viewed: make(chan struct{}), bookWarnings: map[string]engine.BookWarning{}, windowWarnings: map[string][]string{}, touched: touched, performed: map[string]Performed{}, aiEditTickets: aiEditTickets, actPrefix: strconv.FormatInt(time.Now().UnixNano(), 36)}
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
	h.loadSystemFolderTitles()
	// 書庫を整える（読めない物を移す・戻す、足りないシステムフォルダを足す、名前の重なりに番号を付ける）。初めての起動のアクションは、整えた書庫で行う
	h.settleLibrary(true)
	h.runOnceActions()
	if err := h.checkBooksAndOutsidePages(); err != nil {
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

// checkBooksAndOutsidePages は、全部のブックとブックの外のページを今のプラグインで確かめ直す（h.mu を持って呼ぶ）
func (h *Hub) checkBooksAndOutsidePages() error {
	if err := h.checkBooks(h.order); err != nil {
		return err
	}
	return h.checkOutsidePages(h.pagesNotInBooks())
}

// checkOutsidePages は、ids のうちブックの外のページ（pagesNotInBooks）を今のプラグインで確かめ、warning のあるページの一覧を直す（読めるが機能台帳に無い物を持つ W007。新しい warning は常駐のログに書く）。
// ブックの外のページでなくなったページ（消えた・ブックへ入った・ゴミ箱に入った・読めない物になった）の warning は外す（h.mu を持って呼ぶ）
func (h *Hub) checkOutsidePages(ids []string) error {
	outside := map[string]bool{}
	for _, id := range h.pagesNotInBooks() {
		outside[id] = true
	}
	maps.DeleteFunc(h.pageWarnings, func(id string, _ string) bool { return !outside[id] })
	ids = slices.DeleteFunc(slices.Clone(ids), func(id string) bool { return !outside[id] })
	if len(ids) == 0 {
		return nil
	}
	bodies := make([]json.RawMessage, 0, len(ids))
	for _, id := range ids {
		bodies = append(bodies, h.pages[id].body)
	}
	found, err := h.engine.CheckOutsidePages(bodies)
	if err != nil {
		return err
	}
	for _, id := range ids {
		line, ok := found[id]
		if ok && h.pageWarnings[id] != line {
			fmt.Fprintln(os.Stderr, "warning:", line)
		}
		if ok {
			h.pageWarnings[id] = line
		} else {
			delete(h.pageWarnings, id)
		}
	}
	return nil
}

// checkBooks は ids のブックを今のプラグインで確かめ、warning のあるブックの一覧を直す。新しい warning は常駐のログに書く。
// 読めない物のフォルダに移ったブックは確かめない（1 冊ずつの warning にせず、読めない物の warning W032 にまとめる。h.mu を持って呼ぶ）
func (h *Hub) checkBooks(ids []string) error {
	shown := slices.DeleteFunc(slices.Clone(ids), h.inUnreadable)
	found, err := h.engine.CheckBooks(h.bookBodies(shown))
	if err != nil {
		return err
	}
	h.recordWarnings(ids, found)
	return nil
}

// bookBodies は、ids のブックの本文（メモリに無いブックは飛ばす。h.mu を持って呼ぶ）
func (h *Hub) bookBodies(ids []string) []json.RawMessage {
	bodies := make([]json.RawMessage, 0, len(ids))
	for _, id := range ids {
		if e, ok := h.books[id]; ok {
			bodies = append(bodies, e.body)
		}
	}
	return bodies
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

// AIBooks は、AI の MCP 公開ツールの一覧に出すブック（AI と CLI に見せない物と、バックヤードの中のブックを除く）を、並びの順に返す
func (h *Hub) AIBooks() []Book {
	h.mu.Lock()
	defer h.mu.Unlock()
	books := make([]Book, 0, len(h.order))
	for _, id := range h.order {
		if e := h.books[id]; !h.outOfSight(id) && !h.unshown(id) {
			books = append(books, Book{ID: id, Body: e.body, Version: e.version})
		}
	}
	return books
}

// hasBook は、ブック id が置き場所にあるか（ゴミ箱の中のブックも。h.mu を持って呼ぶ）
func (h *Hub) hasBook(id string) bool {
	_, ok := h.books[id]
	return ok
}

// Book は 1 冊のブック（無いかゴミ箱の中のブックなら nil）
func (h *Hub) Book(id string) *Book {
	h.mu.Lock()
	defer h.mu.Unlock()
	e, ok := h.books[id]
	if !ok || h.outOfSight(id) {
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
