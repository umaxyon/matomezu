package server

// アクションバルクを行う: 1 回の Perform を順に行い、変わった物を置き場所に書き、窓に知らせる。同じ鍵の頼みは覚えた答えを返す

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"slices"
	"strconv"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
)

// 覚えておく、行ったアクションバルクの番号（key）の数。窓は答えが届かなかったバルクを同じ番号で送り直すので、同じ番号は二度行わない
const performedKeys = 1024

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
	// Participant は、AI の口が受け取った参加者の id（窓からは受けない）
	Participant string `json:"-"`
}

// performOne は、アクション 1 つのバルクの頼み
func performOne(action string, args json.RawMessage, on *engine.On) Perform {
	return Perform{Actions: []engine.BulkAction{{Action: action, Args: args, On: on}}}
}

// ErrNoActions は、アクションが 1 つも無いバルク
var ErrNoActions = errors.New("a perform needs at least one action")

// Performed は行った結果（断ったら Detail に AI への説明。認可ステップが止めたら Permission にそのステップの id）
type Performed struct {
	OK         bool   `json:"ok"`
	Reason     string `json:"reason,omitempty"`
	Permission string `json:"permission,omitempty"`
	Detail     string `json:"detail,omitempty"`
	Kind       string `json:"kind,omitempty"` // 断りの種類（アクションが添えた名前か、土台の種類）
	// 名前が重なる断り（title-taken）で、重なった相手がシステムフォルダのときの、その印（定義の id。AI に見せる名前は英語なので、利用者の言語で重なった相手が分かるように）
	SystemFolder string          `json:"systemFolder,omitempty"`
	Result       json.RawMessage `json:"result,omitempty"`
	Notice       string          `json:"notice,omitempty"` // AI への知らせ（可変ページの中身をずらして位置が変わったなど）
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
	// 時点の無いアクション（AI やホストが頼んだ物）は、ここで時計を 1 回読んで時点と日付を決める（前に決めた時点より後）
	h.actionNow = laterThan(h.actionNow, time.Now())
	in := engine.Input{Actions: stamped(p.Actions, h.actionNow), Settings: h.settings, Actor: h.actorOfHeld(p), TimeoutSec: p.TimeoutSec}
	if err := h.performInputs(&in); err != nil {
		return Performed{}, err
	}
	in.Watched = h.watched()
	in.WatchedRecords = h.watchedRecords()
	out, err := h.engine.PerformWith(in, recordSource{h})
	// フォローステップがバックヤードの中に行う事の先のブックか、ブックが新しく置いた参照エントリの指す先を渡していなければ、その行を足して行い直す
	// （どちらもアクションのあとに決まるので、先には渡せない。1 回ごとに足りない物が減るので、ブックの数で止まる）。足せる行が無ければ断る
	for tries := 0; err == nil && !out.OK && out.Reason == "needs-rows" && tries < len(h.books)+1; tries++ {
		if !h.addNeededInputs(&in, out.Needs) {
			out = engine.Output{OK: false, Reason: "refused", At: out.At}
			break
		}
		out, err = h.engine.PerformWith(in, recordSource{h})
	}
	if err != nil {
		return Performed{}, err
	}
	done := Performed{OK: out.OK, Reason: out.Reason, Permission: out.Permission, Detail: out.Detail, Kind: out.Kind, SystemFolder: out.SystemFolder, Result: out.Result, Notice: out.Notice}
	if !out.OK {
		if out.At != nil && *out.At >= 0 && *out.At < len(p.Actions) {
			fmt.Fprintf(os.Stderr, "%s refused at the action %d of %d (%s): %s\n", stamp(), *out.At, len(p.Actions), p.Actions[*out.At].Action, out.Reason)
		}
		h.remember(p.Key, done)
		h.ack(p, done)
		return done, nil
	}
	// AI のアクションは、窓に出ているステージエントリ（ブックと、ブックの外のページ）をゴミ箱に入れない（AI は利用者に聞く）
	if p.By == "ai" && h.trashesShown(out.Trashing) {
		done = Performed{OK: false, Reason: "open-on-screen"}
		h.remember(p.Key, done)
		h.ack(p, done)
		return done, nil
	}
	by := "host"
	if p.By == "ai" {
		by = "ai"
	} else if p.Client != "" {
		by = "window"
	}
	// 窓のアクションで要求中の参加者が受け入れられた・断られた・キャンセルされたら、その AI に知らせる（watch.go。受け取られるまで行列で持つ）
	var requested, cancelled map[string]bool
	if by == "window" {
		requested = h.requestedParticipants()
		if len(requested) > 0 {
			cancelled = h.cancelledIn(p.Actions)
		}
	}
	// アクションが返した AI 間メッセージは、送り手と全部の宛先に参加の確定した参加者がいるときだけ送る（いなければ、何も変えずにバルクごと断る）
	envelopes, envelopesRefused := h.actionEnvelopes(out.AIMessages, in.Actor, time.Now())
	if envelopesRefused != nil {
		h.remember(p.Key, *envelopesRefused)
		h.ack(p, *envelopesRefused)
		return *envelopesRefused, nil
	}
	hostEnvelopes, err := h.hostEnvelopes(out.HostMessages, in.Actor)
	if err != nil {
		return Performed{}, err
	}
	act := h.actPrefix + "-" + strconv.FormatInt(h.acts+1, 10)
	shared := h.sharedWithUnreadable()
	out = withoutSharedRemovals(out, shared)
	plan, err := h.planWrites(out, by, act, stamp())
	if err != nil {
		return Performed{}, err
	}
	if plan != nil {
		keepSharedPlaces(plan, shared)
	}
	if plan == nil || h.touchesUnreadable(out) {
		// 新しく足すページ・フォルダの id が、世界にもう在る（エンジンが受けたブックの外に）か、読めない物のフォルダの物の行を書き換える。何も変えずに断る
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
	for _, e := range hostEnvelopes {
		h.deliverHost(e)
	}
	h.wakeOnParticipants(requested, cancelled)
	h.remember(p.Key, done)
	h.ack(p, done)
	return done, nil
}

// performInputs は、バルク in.Actions を行う前に、エンジンへ渡すページ・フォルダ・アノテーション・レコード・番号の表を in に入れる（h.mu を持って呼ぶ）。
// アクションごとに要るブック（レコードが対象なら引数から答えた読むだけのブック、宛先があればそのブック）の和と、そのアノテーションと、それらのブックから書庫の一番上までのフォルダを渡す。
// 宛先がブックに入っていないページなら、そのページ（バインダの中なら、そのバインダと中のページの全部）と、そのアノテーションと、そこから書庫ホームまでのフォルダを渡す。
// 一覧のアクション（宛先が無く、レコードが対象でない）か、宛先がブックの外のバインダのアクションか、0 番目でなく宛先が置き場所に無い（バルクの前のアクションが作ったページなど）アクションを含むなら、
// 全部のブックと、ブックに入っていないページとバインダの全部（ゴミ箱の中の物も）と、アノテーションの全部と、書庫ホーム・ゴミ箱・フォルダ・バックヤードの全部
// （バックヤードは、バックヤードにまだ無いブックを作って置くアクションのため）
func (h *Hub) performInputs(in *engine.Input) error {
	all := false
	yards := false // レコードが対象のアクションがある（フォローステップがバックヤードの中のブックを引くので、バックヤードの行も渡す）
	books := []string{}
	entries := []string{} // 宛先のページがブックに入っていないときの、渡すエントリ（そのページか、それを持つバインダ）
	named := []string{}   // 宛先がブックそのもののときの、そのブック（名前を変えうるので、隣のエントリの行も渡す）
	// 読めない物のフォルダに移ったブックは渡さない（書庫に入らないので、名指したアクションは無い物として断られる）
	add := func(id string) {
		if id != "" && !slices.Contains(books, id) && !h.inUnreadable(id) {
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
			yards = true
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
				if step.On.Page == "" && !slices.Contains(named, book) {
					named = append(named, book)
				}
			case step.On.Page != "" && known:
				if e := h.entryNotInBook(step.On.Page); e != "" && !slices.Contains(entries, e) {
					entries = append(entries, e)
				}
			case step.On.Page == "" && h.binderNotInBook(book):
				// 宛先がブックの外のバインダ（ブックが対象のアクションを、そのバインダに行う）なら、一覧のアクションと同じく全部
				// （行った後の書庫を、書庫が対象のアクションと同じ決まりで確かめる）
				all = true
			case i == 0:
			default:
				all = true
			}
		}
	}
	in.Annotations = map[string]json.RawMessage{}
	if all {
		order := slices.DeleteFunc(slices.Clone(h.order), h.inUnreadable)
		in.Pages, in.Folders = h.rowsOf(append(order, h.entriesNotInBooks()...))
		in.Folders = append(append(in.Folders, h.openRows()...), h.backyardRows()...)
		for page, list := range h.annotations {
			if !h.inUnreadable(page) {
				in.Annotations[page] = list
			}
		}
		return nil
	}
	// 渡す物を指す参照エントリを持つブックも（指す物を消す・ブックに入れると、同じ書き込みでその参照エントリを外すため）
	for _, b := range h.referringBooks(append(slices.Clone(books), entries...)) {
		add(b)
	}
	needed := append(slices.Clone(books), entries...)
	in.Pages, in.Folders = h.rowsOf(needed)
	in.Folders = append(in.Folders, h.openRowsAbove(needed)...)
	if yards {
		in.Folders = append(in.Folders, h.backyardRows()...)
	}
	// 宛先がブックそのものか、ブックに入っていないページなら、同じフォルダに直に入っている隣のエントリの行も
	// （名前の重なりを確かめるため。隣のブック・フォルダの中の行は渡さない）
	nearPages, nearFolders := h.neighborRows(append(slices.Clone(named), entries...), needed)
	in.Pages = append(in.Pages, nearPages...)
	in.Folders = append(in.Folders, nearFolders...)
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

// actorOfHeld は、ワークルームをアクションと同じロックの中で引く。引いてからアクションを行うまでに参加者が入れ替わらない
func (h *Hub) actorOfHeld(p Perform) *engine.Actor {
	if p.By == "ai" {
		return h.actorOfParticipantHeld(p.Participant)
	}
	return nil
}

// addNeededInputs は、エンジンが needs-rows で答えた物 ids（ブックか、参照エントリの指す先）の行を in に足す（指す先は referredEntry で決めた物）。
// 1 つも足せなければ偽（h.mu を持って呼ぶ）
func (h *Hub) addNeededInputs(in *engine.Input, ids []string) bool {
	books := []string{}
	entries := []string{}
	for _, id := range ids {
		e, isBook := id, h.hasBook(id)
		if !isBook {
			e, isBook = h.referredEntry(id)
		}
		switch {
		case e == "" || h.inUnreadable(e):
		case isBook:
			books = append(books, e)
		default:
			entries = append(entries, e)
		}
	}
	if len(books) == 0 && len(entries) == 0 {
		return false
	}
	h.addBookInputs(in, books)
	pages, folders := h.rowsOf(entries)
	in.Pages = append(in.Pages, pages...)
	in.Folders = append(in.Folders, folders...)
	return true
}

// addBookInputs は、エンジンに渡す in に、ブック books の行（中の物も）とそのページのアノテーションを足す（h.mu を持って呼ぶ）
func (h *Hub) addBookInputs(in *engine.Input, books []string) {
	for _, id := range books {
		if !h.hasBook(id) || h.inUnreadable(id) {
			continue
		}
		pages, folders := h.rowsOf([]string{id})
		in.Pages = append(in.Pages, pages...)
		in.Folders = append(in.Folders, folders...)
		maps.Copy(in.Annotations, h.annotationsIn(id))
	}
}
