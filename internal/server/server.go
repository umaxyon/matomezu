// Package server は matomezu の常駐の HTTP サーバー。127.0.0.1 だけで待つ。
//
//	/                     画面（ビルドした web/dist）。そのほかの API に当たらない道はファイルとして配る
//	GET  /api/ping        {"version", "pid"} 立っているかの確認                                  … 要合言葉
//	POST /api/stop        常駐を止める                                                          … 要合言葉
//	GET  /api/data        {"pages": [{"id", "page", "version"}], "folders": [{"id", "folder", "version"}], "settings", "annotations": {ページの id: [...]}, "records": {種類: {id: レコード}}, "counters": {種類: {区切り: 次の番号}}, "plugins": [{"id", "ui", "css"}], "touched": {id: 時刻}, "participantCalls": {参加者の id: 最後に呼ばれた時刻}, "participantReady": [準備中でない参加者の id], "participantLive": {参加者の id: {"model", "branch"}}} 置いてあるブック（ゴミ箱のブックも）と設定、
//	                      ブックごとのアノテーション、レコード（郵便も）と番号の表、追加プラグイン（ui と css は画面が読む道。css は無ければ空）、ブックに触れた（開いたか書いた）時刻（touched.go）  … 画面から
//	GET  /api/plugins/{n}/ui.js   追加プラグインの n 番目の、画面で import() する JS（道には ?v= で追加プラグインの版を付けて配る）  … 画面から
//	GET  /api/plugins/{n}/ui.css  追加プラグインの n 番目の CSS                                               … 画面から
//	POST /api/plugins        {"dir"} 開発者プロジェクトのフォルダの追加プラグインを足す（同じ id なら入れ替える）。{"ok", "id"} か {"ok": false, "reason"}  … 要合言葉
//	POST /api/plugins/remove {"id"} 追加プラグインを外す。{"ok"} か {"ok": false, "reason"}                     … 要合言葉
//	GET  /api/events      SSE。世界の変わり目の知らせ（hub.go）                                    … 画面から
//	POST /api/perform     {"actions": [{"action", "args", "on", "lang", "ids", "now"}], "client", "seq", "key"} アクションバルクを行い（全部通るか全部断る。actions が空なら 400）、
//	                      {"ok", "reason", "permission", "detail", "result", "notice"}（ok 以外は無ければ省く。result は最後のアクションの結果）を返す。読めないページで断ったら code に理由の warning の番号。
//	                      変わったものは /api/events で知らせる                                     … 画面から
//	POST /api/warnings     {"client", "warnings": [{"code", "plugin", "params"}]} 窓が見つけた warning（その窓の分を入れ替える）。常駐が集めてログと、MCP 公開ツールの actions が返す物に出す
//	POST /api/log         {"client", "lines": [{"at", "text"}]} 窓が書き残した事（つながりが切れた・読み直せなかったなど。at は窓の時刻）。常駐のログに出す  … 画面から
//	POST /api/ai-edit-tickets  {"act", "places", "outcome", "book", "lost"} 窓が、AI の変更のうちページとフォルダ places を見た（seen）・見られる前に消えた（lost。ブック book の、消えた所と AI の値）（ai_edit_tickets.go）  … 画面から
//	POST /api/view        {"client", "view", "editLocks", "recordLocks", "focused", "seq"} 窓のカレントのステージが見ているもの（view）と、利用者が直している物（editLocks。
//	                      ブックの id → 物の id の並び。AI のアクションがそれを変えるか消すなら断る。editlock.go）と、その窓がフォーカスされたか。
//	                      seq は窓ごとに増やす番号で、受けたものより古い番号の view と editLocks は捨てる（届く順が入れ替わるため）  … 画面から
//
// AI の入口（MCP。internal/mcp）は合言葉で通す:
//
//	GET  /api/ai/view        最後にフォーカスされた窓が見ているもの（{"front", "book", "page", "selection", "awaiting"}。無ければ null。awaiting は見ているブックの、AI の応えを待つアノテーション。
//	                      コントロールセンターがカレントスクリーンの窓は {"front": "control-center", "hidden": {後ろに隠れているブックスクリーンの book, page, selection, awaiting など}}）
//	GET  /api/ai/books  {"books": [{"id", "type", "title", "version", "awaiting"}]}（awaiting は AI の応えを待つアノテーションの数）
//	GET  /api/ai/books/{id}  {"id", "book", "version", "annotations", "placed"}（?outline=1 ならページの目次。ai_outline.go）
//	GET  /api/ai/pages/{page}  {"book", "folder", "page", "version", "annotations", "placed"}（book はそのページを持っているブックの id、folder はそのページが入っているフォルダ（ブックの直下ならブック、バインダの中ならバインダ）の id、version はそのページの版、annotations はそのページの物に立つもの。?outline=1 でページの中の物の目次、?item=id でその物だけ。ai_outline.go）。読めないページは {"ok": false, "reason": "unreadable", "code"}（code は読めない理由の warning の番号）
//	GET  /api/ai/folder[?folder=ID]  書庫ホーム（folder が無いとき）かフォルダ 1 つの {"id", "kind", "title", "path", "lineup"}（書庫ホームからの道筋と、直下のエントリを 1 段だけ。ai_folder.go）
//	GET  /api/ai/records?kind=K[&id=ID | &ids=a&ids=b | &where.key=value&is.key=absent&limit=N&before=ID]  AI に見せる種類（対象の定義の aiBrief）のレコード（ai_records.go）。
//	                      id はその 1 件の全文、ids は何件かの全文、どちらも無ければ一覧（索引キーで探す種類は {"kind","records","total","older"}）
//	GET  /api/ai/awaiting    {"awaiting": [{"book", "title", "annotation", "brief"}], "undone": [{"book", "title", "at", "lost"}], "failed": [{"book", "title", "key", "changed"}], "removed": [{"book", "title", "key", "cause"}]}
//	                         AI の応えを待つアノテーションの全部と、見られる前に利用者が戻した AI の変更の全部と、失敗にした AI 編集チケット（変更提案郵便など）の全部と、
//	                         郵便が消えたと記した AI 編集チケット（cause は上限で消えた limit か、利用者が消した user）の全部
//	                         （undone と failed と removed は、渡したら、次の利用者トリガートークのときに消える）
//	GET  /api/ai/watch?host=<プロセス id>&session=<立てたときのセッション id>（どちらか一方は要る）[&maxLine&maxNotice&gap]  SSE。そのプロセス id かセッション id の AI を起こす知らせ（event: wake、data: {"line", "id", "session", "text"}。参加の要求が受け入れられた・断られた、AI 間メッセージ。watch.go）
//	POST /api/ai/watch/ack   {"line", "id", "result"} 通り道に流した知らせを渡せたか（delivered・absent・failed）。{} を返す（watch.go）
//	POST /api/ai/talked      {"sessionId", "host", "candidates", "woken"} AI のターンが始まった（AI のフックが知らせる）。candidates が無く woken でなければ、利用者トリガートークのときに行うアクションを、アノテーションのあるブックごとに行い、AI に渡した、見られる前に消えた AI の変更を消す。
//	                         woken は、利用者トリガートークでなく、裏の知らせ（watch の 1 行など）で始まったターンのフック（結びつけと「参加しました」の知らせだけを行う）。
//	                         どちらも {"welcomes", "unbound"} を返す（セッションと参加者の結びつけと「参加しました」の知らせ。talk_session.go）
//	POST /api/ai/model       {"sessionId", "model", "host"} AI のフックがセッションのモデルを知らせる（model.go）。{} を返す
//	GET  /api/ai/settings    AI が読む利用者の設定（項目の id → 値。engine.AISettings）
//	GET  /api/ai/catalog?ids=a&ids=b  MCP 公開ツールの actions が返す物。ids が無ければ {"version", "index", "warnings"}（一覧の版と目次。warnings は今あるときだけ）、あれば ids の物の全文 {"version", 表の名前: [全文]..., "unknown"}
//	POST /api/ai/perform     {"action", "args", "on"} アクションを利用者の言語で行い、{"ok", "reason", "permission", "detail", "result", "notice"}（ok 以外は無ければ省く）を返す。宛先か動かす物が読めないページなら {"ok": false, "reason": "unreadable", "code"}（理由の文は添えない）
//	GET  /api/ai/join-rules  参加を頼む AI が読む手順。
//	POST /api/ai/join        {"ai", "model", "env", "sessionName", "link", "sessionId"} 参加を頼む（参加者を作り、利用者に知らせる郵便を送る）。{"ok", "participant"} か弾いた理由（join.go）
//	POST /api/ai/message     {"to", "text"} AI 間メッセージを、ワークルーム to の参加者に送る（受け取られるまで常駐が持つ）。{"ok", "queued"} か断った理由（message.go）
//	POST /api/ai/show        {"book", "page", "stage", "split"} 最後にフォーカスされた窓にブックを出す（Hub.Show）。
//	                         窓が無ければブラウザで開き、つながるのを待ってから出す。{"ok", "opened"} か {"ok": false, "reason", "url"} を返す
//
// 合言葉は Authorization: Bearer <token> で渡す（server.json の token。常駐ごとに作る）。
// 「画面から」の入口は、この常駐の画面からの頼みで、画面 cookie を持つブラウザの物だけを受ける（screen。sameOrigin でほかのサイトに開かれたページから書かせず、withCookie で cookie の鍵を確かめる。screen_cookie.go）。
// 画面 cookie は、ブラウザを開くときの URL の使い捨てのコードで渡す:
//
//	GET  /cookie?code=…  コードを 1 度だけ受け付け、鍵を cookie（HttpOnly）に置いて / へ戻す
//	POST /api/open     （合言葉つき）cookie のコード付きでブラウザを開く。コードは返さない（matomezu open）
package server

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

// user は設定の持ち主（利用者は 1 人）
const user = "me"

// 書く頼みの中身の大きさの上限
const maxBody = 16 << 20

// Options は常駐の中身
type Options struct {
	Web     fs.FS  // 配る画面のファイル（index.html が根）
	Token   string // 合言葉
	Version string
	Stop    func() // /api/stop で呼ぶ。呼ばれたら常駐を止める
	Hub     *Hub
	URL     string                 // 画面の URL
	Open    func(url string) error // url をブラウザで開く（無ければ開かない）。cookie のコードを付けた url を渡す
	Cookies *ScreenCookies         // 画面 cookie（無ければ、保存しない物を作る）
	Wait    time.Duration          // ブラウザで開いた窓がつながるのを待つ長さ（0 なら windowWait）
	Latest  time.Duration          // 最後にフォーカスされた窓が見ているものを知らせるのを待つ上限（0 なら latestWait）
	Keep    time.Duration          // 窓に keep を送る間隔（0 なら keepAlive）
}

// windowWait は、ブラウザで開いた窓がつながるのを待つ既定の長さ
const windowWait = 20 * time.Second

// latestWait は、最後にフォーカスされた窓が見ているものを知らせるのを待つ既定の上限（ふつうは数十ミリ秒で届く。窓が固まったときのため）
const latestWait = 3 * time.Second

// waitLatest は、AI に答える前に、最後にフォーカスされた窓が見ているものを知らせるのを待つ（開いた直後の窓を飛ばして、前の窓を選ばないため）
func (o Options) waitLatest() {
	d := o.Latest
	if d == 0 {
		d = latestWait
	}
	o.Hub.WaitLatest(d)
}

// つながりを保ち、窓につながっていると見せるために keep を送る間隔
const keepAlive = 25 * time.Second

// Handler は常駐の入口をまとめた http.Handler
func Handler(o Options) http.Handler {
	if o.Cookies == nil {
		o.Cookies = NewScreenCookies(nil, nil)
	}
	mux := http.NewServeMux()
	mux.Handle("GET /api/ping", o.auth(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"version": o.Version, "pid": os.Getpid()})
	}))
	mux.Handle("POST /api/stop", o.auth(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{})
		if o.Stop != nil {
			go o.Stop()
		}
	}))
	mux.Handle("GET /api/data", o.screen(o.data))
	mux.Handle("GET /api/search", o.screen(o.search(true)))
	mux.Handle("GET /api/events", o.screen(o.events))
	mux.Handle("GET /api/plugins/{n}/{file}", o.screen(o.pluginFile))
	mux.Handle("GET /cookie", http.HandlerFunc(o.giveCookie))
	mux.Handle("POST /api/open", o.auth(o.openAPI))
	mux.Handle("POST /api/plugins", o.auth(o.linkPlugin))
	mux.Handle("POST /api/plugins/remove", o.auth(o.unlinkPlugin))
	mux.Handle("POST /api/perform", o.screen(o.perform))
	mux.Handle("POST /api/view", o.screen(o.view))
	mux.Handle("POST /api/warnings", o.screen(o.warnings))
	mux.Handle("POST /api/log", o.screen(o.windowLog))
	mux.Handle("POST /api/ai-edit-tickets", o.screen(o.aiEditTicket))
	mux.Handle("GET /api/ai/view", o.ai(o.aiView))
	mux.Handle("GET /api/ai/books", o.ai(o.aiBooks))
	mux.Handle("GET /api/ai/books/{id}", o.ai(o.aiBook))
	mux.Handle("GET /api/ai/pages/{page}", o.ai(o.aiPage))
	mux.Handle("GET /api/ai/folder", o.ai(o.aiFolder))
	mux.Handle("GET /api/ai/awaiting", o.ai(o.aiAwaiting))
	mux.Handle("GET /api/ai/watch", o.ai(o.aiWatch))
	mux.Handle("POST /api/ai/watch/ack", o.ai(o.aiWatchAck))
	mux.Handle("GET /api/ai/records", o.ai(o.aiRecords))
	mux.Handle("GET /api/ai/search", o.ai(o.search(false)))
	mux.Handle("POST /api/ai/talked", o.ai(o.aiTalked))
	mux.Handle("POST /api/ai/model", o.ai(o.aiModel))
	routesForTest(mux, o)
	mux.Handle("GET /api/ai/settings", o.ai(func(w http.ResponseWriter, _ *http.Request) {
		settings, err := o.Hub.AISettings()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(settings)
	}))
	mux.Handle("GET /api/ai/catalog", o.ai(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(o.Hub.AICatalog(r.URL.Query()["ids"]))
	}))
	mux.Handle("POST /api/ai/perform", o.ai(o.aiPerform))
	mux.Handle("POST /api/ai/show", o.ai(o.aiShow))
	mux.Handle("GET /api/ai/join-rules", o.ai(o.aiJoinRules))
	mux.Handle("POST /api/ai/join", o.ai(o.aiJoin))
	mux.Handle("POST /api/ai/message", o.ai(o.aiMessage))
	mux.Handle("/api/", http.NotFoundHandler())
	mux.Handle("/", http.FileServerFS(o.Web))
	return mux
}

// auth は合言葉の合う頼みだけを通す
func (o Options) auth(h http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || subtle.ConstantTimeCompare([]byte(got), []byte(o.Token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		h(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// sameOrigin は、この常駐の画面からの頼みだけを通す。宛先（Host）が手元の名前で、
// Origin があればその宛先と同じ（ほかのサイトのページからは Origin が違う）。書く頼みは JSON の本文に限る（ほかのサイトのフォームからは送れない）
func sameOrigin(h http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.Host)
		local := err == nil && (host == "localhost" || net.ParseIP(host) != nil && net.ParseIP(host).IsLoopback())
		origin := r.Header.Get("Origin")
		if !local || (origin != "" && origin != "http://"+r.Host) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if r.Method != http.MethodGet {
			if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "application/json" {
				http.Error(w, "the body must be JSON", http.StatusUnsupportedMediaType)
				return
			}
		}
		h(w, r)
	})
}

func (o Options) data(w http.ResponseWriter, _ *http.Request) {
	settings, annotations := o.Hub.Data()
	pages, folders := o.Hub.Tables()
	if settings == nil {
		settings = json.RawMessage("null")
	}
	type plugin struct {
		ID  string `json:"id"`
		UI  string `json:"ui"`
		CSS string `json:"css,omitempty"`
		// 利用者が有効にしていない追加プラグイン（画面も、名乗りと文言だけで組む）
		Disabled bool `json:"disabled,omitempty"`
	}
	files, v := o.Hub.Plugins()
	plugins := make([]plugin, len(files))
	for i, p := range files {
		plugins[i] = plugin{ID: p.ID, UI: fmt.Sprintf("api/plugins/%d/ui.js?v=%d", i, v), Disabled: p.Disabled}
		if p.CSS != nil {
			plugins[i].CSS = fmt.Sprintf("api/plugins/%d/ui.css?v=%d", i, v)
		}
	}
	records, counters := o.Hub.Records()
	writeJSON(w, map[string]any{"pages": pages, "folders": folders, "settings": settings, "annotations": annotations, "records": records, "counters": counters, "plugins": plugins, "touched": o.Hub.Touched(), "participantCalls": o.Hub.ParticipantCalls(), "participantReady": o.Hub.ParticipantReady(), "participantLive": o.Hub.ParticipantLive()})
}

func (o Options) pluginFile(w http.ResponseWriter, r *http.Request) {
	files, _ := o.Hub.Plugins()
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil || n < 0 || n >= len(files) {
		http.NotFound(w, r)
		return
	}
	p := files[n]
	w.Header().Set("Cache-Control", "no-cache")
	switch {
	case r.PathValue("file") == "ui.js":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		_, _ = w.Write(p.UI)
	case r.PathValue("file") == "ui.css" && p.CSS != nil:
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		_, _ = w.Write(p.CSS)
	default:
		http.NotFound(w, r)
	}
}

func (o Options) linkPlugin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Dir string `json:"dir"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBody)).Decode(&req); err != nil || req.Dir == "" {
		http.Error(w, "the body must be {\"dir\"}", http.StatusBadRequest)
		return
	}
	id, err := o.Hub.LinkPlugin(req.Dir)
	if err != nil {
		writeJSON(w, map[string]any{"ok": false, "reason": err.Error()})
		return
	}
	writeJSON(w, map[string]any{"ok": true, "id": id})
}

func (o Options) unlinkPlugin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBody)).Decode(&req); err != nil || req.ID == "" {
		http.Error(w, "the body must be {\"id\"}", http.StatusBadRequest)
		return
	}
	if err := o.Hub.UnlinkPlugin(req.ID); err != nil {
		writeJSON(w, map[string]any{"ok": false, "reason": err.Error()})
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

func (o Options) events(w http.ResponseWriter, r *http.Request) {
	c := o.Hub.Join()
	defer o.Hub.Leave(c)
	o.stream(w, r, c.ch)
}

// stream は、知らせの通り道 ch を SSE で書き出す（間が空けば keep を送る）。ch が閉じるか、頼んだ側が切れたら終える
func (o Options) stream(w http.ResponseWriter, r *http.Request, ch <-chan event) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming is not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	flusher.Flush() // つながったことを、最初の知らせを待たずに返す
	every := o.Keep
	if every == 0 {
		every = keepAlive
	}
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.name, ev.data)
		case <-tick.C:
			fmt.Fprint(w, "event: keep\ndata: {}\n\n")
		case <-r.Context().Done():
			return
		}
		flusher.Flush()
	}
}

func (o Options) perform(w http.ResponseWriter, r *http.Request) {
	var p Perform
	if !readJSON(w, r, &p) {
		return
	}
	if len(p.Actions) == 0 {
		http.Error(w, "actions must have at least one action", http.StatusBadRequest)
		return
	}
	done, err := o.Hub.Perform(p)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, done)
}

func (o Options) view(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Client      string              `json:"client"`
		View        json.RawMessage     `json:"view"`
		Focused     bool                `json:"focused"`
		Seq         int64               `json:"seq"`         // 窓ごとに増やす番号（古い番号の見ているものは捨てる）
		EditLocks   map[string][]string `json:"editLocks"`   // 利用者が直している物（ブックの id → 物の id の並び。editlock.go）
		RecordLocks map[string][]string `json:"recordLocks"` // 利用者が直しているレコード（対象の種類の id → レコードの id の並び。editlock.go）
	}
	if !readJSON(w, r, &req) {
		return
	}
	if !o.Hub.SetView(req.Client, req.View, req.EditLocks, req.RecordLocks, req.Focused, req.Seq) {
		http.Error(w, "unknown client", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{})
}

func (o Options) warnings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Client   string          `json:"client"`
		Warnings json.RawMessage `json:"warnings"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	ok, err := o.Hub.SetWindowWarnings(req.Client, req.Warnings)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !ok {
		http.Error(w, "unknown client", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{})
}

// 窓が一度に書き残せる行の数と、1 行の長さ（窓が送る行で常駐のログが埋まらないように、超えた分は捨てる。行の数は画面が溜める上限 MAX_LOG_LINES と同じ）
const (
	maxLogLines = 50
	maxLogText  = 500
)

type logLine struct {
	At   string `json:"at"`
	Text string `json:"text"`
}

func (o Options) windowLog(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Client string    `json:"client"`
		Lines  []logLine `json:"lines"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	writeLog(os.Stderr, req.Client, req.Lines)
	writeJSON(w, map[string]any{})
}

// writeLog は窓が書き残した行を、1 行ずつ常駐の時刻を付けて out に書く（改行は空白にする）
func writeLog(out io.Writer, client string, lines []logLine) {
	flat := func(s string, max int) string {
		s = strings.Join(strings.Fields(s), " ")
		if r := []rune(s); len(r) > max {
			s = string(r[:max]) + "…"
		}
		return s
	}
	if len(lines) > maxLogLines {
		lines = lines[len(lines)-maxLogLines:]
	}
	for _, l := range lines {
		fmt.Fprintln(out, stamp(), "window", flat(client, 20), "at", flat(l.At, 40)+":", flat(l.Text, maxLogText))
	}
}

func (o Options) aiView(w http.ResponseWriter, _ *http.Request) {
	o.waitLatest()
	v := o.Hub.View()
	var view map[string]json.RawMessage
	if v == nil || json.Unmarshal(v, &view) != nil || view == nil {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("null"))
		return
	}
	var book string
	_ = json.Unmarshal(view["book"], &book)
	list, err := o.annotationsOf(book)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// コントロールセンターがカレントスクリーンの間は、見えている物が無いので、一番上に awaiting を置かない（hidden の中だけ）
	if _, covered := view["hidden"]; !covered {
		view["awaiting"], _ = json.Marshal(pick(list, awaiting))
	}
	// コントロールセンターがカレントスクリーンの間、後ろに隠れているブックスクリーンが開いているブックの、AI の応えを待つ物も hidden に添える
	if raw, ok := view["hidden"]; ok {
		var hidden map[string]json.RawMessage
		if json.Unmarshal(raw, &hidden) == nil && hidden != nil {
			var hiddenBook string
			_ = json.Unmarshal(hidden["book"], &hiddenBook)
			hiddenList, err := o.annotationsOf(hiddenBook)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			hidden["awaiting"], _ = json.Marshal(pick(hiddenList, awaiting))
			view["hidden"], _ = json.Marshal(hidden)
		}
	}
	writeJSON(w, view)
}

func (o Options) aiBooks(w http.ResponseWriter, r *http.Request) {
	books := o.Hub.AIBooks()
	warnings := o.Hub.BookWarnings()
	unreadablePages := o.Hub.UnreadablePageLines() // 読めないページを持つブックの、その warning の 1 行ずつ
	annotations, err := o.Hub.AIAnnotations(nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	type head struct {
		ID      string `json:"id"`
		Title   string `json:"title"`
		Version int64  `json:"version"`
		Problem string `json:"problem,omitempty"`  // 読めないブックの理由（warning の 1 行。開けず、アクションも行えない）
		Warning string `json:"warning,omitempty"`  // 読めるが、機能台帳に無いアイテムや設定の項目（W007 の 1 行）と、読めないページの warning の 1 行ずつ（"; " でつなぐ）（そのまま残っている）
		Awaits  int    `json:"awaiting,omitempty"` // AI の応えを待つアノテーションの数
	}
	heads := make([]head, 0, len(books))
	for _, b := range books {
		// ブックの本文から読むのはブックの名前（title）だけ（ほかの項目は常駐が組む。本文に同じ名前のフィールドがあっても拾わない）
		var body struct {
			Title string `json:"title"`
		}
		_ = json.Unmarshal(b.Body, &body)
		h := head{ID: b.ID, Title: body.Title, Version: b.Version, Awaits: len(pick(annotations[b.ID], awaiting))}
		if n, ok := warnings[b.ID]; ok && n.Unreadable {
			h.Problem = n.Warning
		} else {
			lines := unreadablePages[b.ID]
			if ok {
				lines = append([]string{n.Warning}, lines...)
			}
			h.Warning = strings.Join(lines, "; ")
		}
		heads = append(heads, h)
	}
	writeJSON(w, map[string]any{"books": heads})
}

func (o Options) aiBook(w http.ResponseWriter, r *http.Request) {
	b := o.Hub.Book(r.PathValue("id"))
	if b == nil {
		http.Error(w, "no such book", http.StatusNotFound)
		return
	}
	list, err := o.annotationsOf(b.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if r.URL.Query().Get("outline") != "" {
		writeJSON(w, map[string]any{"id": b.ID, "book": outlineBook(b.Body, o.Hub.PageVersion, o.Hub.UnreadablePage), "version": b.Version, "annotations": list})
		return
	}
	placed, err := o.Hub.AIPlaced(b.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	shown, err := o.Hub.AIBook(b.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"id": b.ID, "book": shown, "version": b.Version, "annotations": list, "placed": placed})
}

func (o Options) aiPerform(w http.ResponseWriter, r *http.Request) {
	// AI の頼みはアクション 1 つ（1 アクションのバルクとして行う）
	var p struct {
		Action     string          `json:"action"`
		Args       json.RawMessage `json:"args"`
		On         *engine.On      `json:"on,omitempty"`
		TimeoutSec int             `json:"timeoutSec,omitempty"`
	}
	if !readJSON(w, r, &p) {
		return
	}
	one := performOne(p.Action, p.Args, p.On)
	one.By, one.Participant, one.TimeoutSec = "ai", r.Header.Get(ParticipantHeader), p.TimeoutSec
	done, err := o.Hub.Perform(one)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// エンジンが読めないページで断った（宛先が読めないページ・読めないページを動かす・消すなど）なら、理由の番号だけを返す
	if !done.OK && done.Reason == "unreadable" && done.Code != "" {
		writeUnreadable(w, done.Code)
		return
	}
	// 読めないブック（保存はあるが今のプラグインで読めない）は「無い」でなく、その理由で断る
	if !done.OK && (done.Reason == "no-book" || done.Reason == "no-page") && p.On != nil {
		if n, ok := o.Hub.BookWarnings()[o.Hub.BookOn(p.On)]; ok && n.Unreadable {
			writeJSON(w, map[string]any{"ok": false, "reason": "unreadable", "detail": n.Warning})
			return
		}
	}
	writeJSON(w, done)
}

func (o Options) aiShow(w http.ResponseWriter, r *http.Request) {
	var req Show
	if !readJSON(w, r, &req) {
		return
	}
	o.waitLatest()
	if reason, detail := o.Hub.showRefusal(r.Header.Get(ParticipantHeader)); reason != "" {
		writeJSON(w, map[string]any{"ok": false, "reason": reason, "detail": detail})
		return
	}
	err := o.Hub.Show(req)
	opened := false
	if errors.Is(err, ErrNoWindow) && o.Open != nil {
		if open := o.openScreen(); open != nil {
			writeJSON(w, map[string]any{"ok": false, "reason": "no-browser", "detail": open.Error(), "url": o.URL})
			return
		}
		wait := o.Wait
		if wait == 0 {
			wait = windowWait
		}
		opened = true
		if o.Hub.WaitWindow(wait) {
			err = o.Hub.Show(req)
		}
	}
	if err != nil {
		writeJSON(w, map[string]any{"ok": false, "reason": err.Error(), "url": o.URL})
		return
	}
	writeJSON(w, map[string]any{"ok": true, "opened": opened})
}

// writeUnreadable は、読めないページへの読み・アクションを断る答え（理由の warning の番号 code だけ。理由の文は AI のコンテキストを食うので添えない）
func writeUnreadable(w http.ResponseWriter, code string) {
	writeJSON(w, map[string]any{"ok": false, "reason": "unreadable", "code": code})
}

// readJSON は本文を v に読む。読めなければ 400 を返して false
func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err == nil {
		err = json.Unmarshal(b, v)
	}
	if err != nil {
		http.Error(w, "the body is not JSON: "+err.Error(), http.StatusBadRequest)
		return false
	}
	return true
}
