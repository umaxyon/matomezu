package server

// ほかのホストとのワークルームの一覧: 常駐どうしが、自分の一覧（参加の確定した AI のいるワークルームの名前と、作業中・空き）の変わった所だけを送り合い、
// 相手の一覧の写しを常駐だけが持つ（起動し直すと消え、つながったときに取り直す）。AI の指示は挟まず、間を置いて送り続けない。
// 自分の一覧は、レコードか参加者の様子が変わったら（kickRooms）少し待ってまとめて作り直し、変わっていれば番号を 1 つ上げ、つながっているペアリングしたホストに差分を送る。
// 届かない差分は捨てる（次につながったときの取り直しで埋まる）。受けた側は、手元の起動の印と番号が差分の「前」と合えば当て、合わなければ取り直す。
// 取り直すのは、相手とつながったと分かったとき（相手の hello の口に通った・相手がこちらの hello の口に来た）と、差分が当たらなかったときだけ。
// 写しは、list_workrooms と、画面のほかのホストの行が使う（相手に聞かずに答える）。つながっていない相手の写しは出さない。
// 自分の一覧と写しの行は、様子が変わった（足された・作業中と空きが入れ替わった）順の通し番号を持つ（このホストの中だけの物で、相手には送らない）。
// AI 用ホストリストは、この番号の新しい順に並べる
//
//	POST /peer/v1/workrooms 差分 {"epoch", "from", "to", "changes": [{"name", "activity"} か {"name", "removed": true}]}  204
//	GET  /peer/v1/workrooms?epoch=&since=  {"epoch", "version", "full", "rows"（full のとき）, "changes"（full でないとき）}
//	  手元の印が今の起動の物で、since からの変わりを覚えていれば（直近 roomHistoryMax 回分）差分、ほかは全部

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"math"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/peer"
)

const (
	roomHistoryMax = 100                    // 差分で答えるために覚える、近い変わりの数
	roomRowsMax    = 500                    // 受ける一覧の行の上限
	roomsSettle    = 200 * time.Millisecond // 続いた変わりを 1 回にまとめて待つ間
)

// RoomRow は、ワークルームの一覧の 1 行: 名前と作業の様子（working・idle・unknown）と、そこにいる AI が生きているか（alive・lapsed・unknown）と、
// AI の UI（このホストの行で、分かるときだけ。ほかのホストの写しは持たない）
type RoomRow struct {
	Name     string `json:"name"`
	Activity string `json:"activity"`
	Alive    string `json:"alive"`
	AiUi     string `json:"aiUi,omitempty"`
}

// 一覧の行の、そこにいる AI が生きているか
const (
	roomAlive   = "alive"   // 生きている
	roomLapsed  = "lapsed"  // 生きていない（参加はしている）
	roomUnknown = "unknown" // 分からない（古い版の相手の写し）
)

// aliveOf は、受けた生きているかの値（無い・知らない値は roomUnknown）
func aliveOf(v string) string {
	if v == roomAlive || v == roomLapsed {
		return v
	}
	return roomUnknown
}

// roomState は、一覧の 1 行の様子: 作業の様子と、そこにいる AI が生きているか
type roomState struct {
	activity string
	alive    string
}

// roomChange は、差分の 1 行: 足す・変わる行は名前と様子、消える行は名前と removed
type roomChange struct {
	Name     string `json:"name"`
	Activity string `json:"activity,omitempty"`
	Alive    string `json:"alive,omitempty"`
	Removed  bool   `json:"removed,omitempty"`
}

// state は、差分の行の様子
func (c roomChange) state() roomState { return roomState{c.Activity, aliveOf(c.Alive)} }

// roomDiff は、一覧の番号 From から To への差分（Epoch は送り手の起動の印）
type roomDiff struct {
	Epoch   string       `json:"epoch"`
	From    int          `json:"from"`
	To      int          `json:"to"`
	Changes []roomChange `json:"changes"`
}

// roomsAnswer は、取り直しの答え
type roomsAnswer struct {
	Epoch   string       `json:"epoch"`
	Version int          `json:"version"`
	Full    bool         `json:"full"`
	Rows    []RoomRow    `json:"rows,omitempty"`
	Changes []roomChange `json:"changes,omitempty"`
}

// roomEntry は、一覧の 1 行の様子と、その様子になった順の通し番号（peerState.roomSeq から振る）
type roomEntry struct {
	state roomState
	seq   uint64
}

// roomCopy は、相手の一覧の写し
type roomCopy struct {
	epoch   string
	version int
	rows    map[string]roomEntry // 名前 → 様子
}

// localRooms は、自分の一覧（番号つき）と近い変わり
type localRooms struct {
	epoch   string
	version int
	rows    map[string]roomEntry
	history []roomDiff // 古い順。どれも From+1 == To で続いている
}

// noteRowsLocked は、一覧 was を、今の様子 now（名前 → 様子）にした物: 様子の同じ行は通し番号を保ち、足された・様子の変わった行に名前の順で新しい番号を振る（ps.mu を持って呼ぶ）
func (ps *peerState) noteRowsLocked(was map[string]roomEntry, now map[string]roomState) map[string]roomEntry {
	out := make(map[string]roomEntry, len(now))
	names := make([]string, 0, len(now))
	for name := range now {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		if old, ok := was[name]; ok && old.state == now[name] {
			out[name] = old
			continue
		}
		ps.roomSeq++
		out[name] = roomEntry{state: now[name], seq: ps.roomSeq}
	}
	return out
}

// applyChangesLocked は、差分の行 changes を一覧 rows に当てる（様子の変わった行に新しい番号。ps.mu を持って呼ぶ）
func (ps *peerState) applyChangesLocked(rows map[string]roomEntry, changes []roomChange) {
	for _, c := range changes {
		switch old, ok := rows[c.Name]; {
		case c.Removed:
			delete(rows, c.Name)
		case ok && old.state == c.state():
		default:
			ps.roomSeq++
			rows[c.Name] = roomEntry{state: c.state(), seq: ps.roomSeq}
		}
	}
}

// statesOf は、一覧の名前 → 様子
func statesOf(rows map[string]roomEntry) map[string]roomState {
	out := make(map[string]roomState, len(rows))
	for name, r := range rows {
		out[name] = r.state
	}
	return out
}

// --- 自分の一覧 ---

// kickRooms は、自分の一覧が変わったかもしれないと知らせる（待たない。h.mu を持っていてもよい）
func (h *Hub) kickRooms() {
	e := h.entrance.Load()
	if e == nil {
		return
	}
	select {
	case e.peers.roomsKick <- struct{}{}:
	default:
	}
}

// followRooms は、知らせを受けるたびに少し待ってから自分の一覧を作り直す（SetHostEntrance が立てる。入口を閉じたら止まる）
func (h *Hub) followRooms(e *hostEntrance) {
	for {
		select {
		case <-e.peers.roomsKick:
		case <-e.done:
			return
		}
		select {
		case <-time.After(roomsSettle):
		case <-e.done:
			return
		}
		select {
		case <-e.peers.roomsKick:
		default:
		}
		h.refreshRooms(e)
	}
}

// roomList は、時点 at の自分の一覧: 参加の確定した AI のいるワークルームの名前 → 様子と、そのうち AI の UI が分かる物の名前 → AI の UI と、
// 起こす知らせを渡せる通り道がつながっていない生きている AI のうち、いちばん早く参加の有効時間が過ぎる時点（無ければ零の時刻）
type roomList struct {
	states    map[string]roomState
	uis       map[string]string
	nextLapse time.Time
}

// roomsNow は、時点 at の自分の一覧
func (h *Hub) roomsNow(at time.Time) (roomList, error) {
	records, err := h.records()
	if err != nil {
		return roomList{}, err
	}
	rooms, err := h.workrooms()
	if err != nil {
		return roomList{}, err
	}
	settings, _ := h.Data()
	h.mu.Lock()
	defer h.mu.Unlock()
	occupant := h.occupants(records)
	var ids []string
	for _, r := range rooms {
		if occupant[r.ID] != "" {
			ids = append(ids, r.ID)
		}
	}
	activity, err := h.engine.WorkroomActivities(ids, recordSource{h})
	if err != nil {
		return roomList{}, err
	}
	aiUiOf := map[string]string{}
	for _, p := range records {
		if p.AiUi != "" {
			aiUiOf[p.ID] = p.AiUi
		}
	}
	out := roomList{states: map[string]roomState{}, uis: map[string]string{}}
	for _, r := range rooms {
		p := occupant[r.ID]
		if p == "" {
			continue
		}
		called, wake := h.participantNotes[p].Called, h.wakeReachLocked(p)
		alive, err := h.engine.ParticipantAlive(settings, called, wake, at)
		if err != nil {
			return roomList{}, err
		}
		st := roomState{activity[r.ID], roomLapsed}
		if alive {
			st.alive = roomAlive
			if wake != engine.WakeReaches {
				lapses, ok, err := h.engine.ParticipantLapsesAt(settings, called)
				if err != nil {
					return roomList{}, err
				}
				if ok && (out.nextLapse.IsZero() || lapses.Before(out.nextLapse)) {
					out.nextLapse = lapses
				}
			}
		}
		out.states[r.Name] = st
		if ui := aiUiOf[p]; ui != "" {
			out.uis[r.Name] = ui
		}
	}
	return out, nil
}

// refreshRooms は、自分の一覧を作り直し、変わっていれば番号を上げて、つながっているペアリングしたホストに差分を送る（届かなければ捨てる）。
// いちばん早く参加の有効時間が過ぎる時点に、作り直しを予約し直す
func (h *Hub) refreshRooms(e *hostEntrance) {
	list, err := h.roomsNow(time.Now()) // ほかのホストへの写しは、名前と様子だけ（AI の UI は送らない）
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not list the workrooms:", err)
		return
	}
	now := list.states
	ps := e.peers
	ps.mu.Lock()
	ps.scheduleLapseLocked(h, list.nextLapse)
	l := &ps.rooms
	changes := roomChanges(statesOf(l.rows), now)
	if len(changes) == 0 {
		ps.mu.Unlock()
		return
	}
	d := roomDiff{Epoch: l.epoch, From: l.version, To: l.version + 1, Changes: changes}
	l.version, l.rows = d.To, ps.noteRowsLocked(l.rows, now)
	l.history = append(l.history, d)
	if len(l.history) > roomHistoryMax {
		l.history = l.history[1:]
	}
	var targets []string
	for id := range ps.known {
		if lv := ps.live[id]; lv != nil && lv.State == PeerConnected {
			targets = append(targets, id)
		}
	}
	ps.mu.Unlock()
	body := mustJSON(d)
	for _, id := range targets {
		c, base, ok := h.peerTarget(e, id)
		if !ok {
			continue
		}
		resp, err := c.Post(base+"/peer/v1/workrooms", "application/json", bytes.NewReader(body))
		if err != nil {
			continue
		}
		resp.Body.Close()
	}
}

// lapseMargin は、参加の有効時間が過ぎる時点から、一覧を作り直すまでの余り（過ぎる前に作り直さないため）
const lapseMargin = 50 * time.Millisecond

// scheduleLapseLocked は、自分の一覧の作り直しを、時点 at（零の時刻なら予約しない）に 1 回だけ予約し直す（ps.mu を持って呼ぶ）
func (ps *peerState) scheduleLapseLocked(h *Hub, at time.Time) {
	if ps.lapseTimer != nil {
		ps.lapseTimer.Stop()
		ps.lapseTimer = nil
	}
	if at.IsZero() {
		return
	}
	ps.lapseTimer = time.AfterFunc(time.Until(at)+lapseMargin, h.kickRooms)
}

// roomChanges は、一覧 was から now への変わった行（名前の順）
func roomChanges(was, now map[string]roomState) []roomChange {
	var out []roomChange
	for name, st := range now {
		if old, ok := was[name]; !ok || old != st {
			out = append(out, roomChange{Name: name, Activity: st.activity, Alive: st.alive})
		}
	}
	for name := range was {
		if _, ok := now[name]; !ok {
			out = append(out, roomChange{Name: name, Removed: true})
		}
	}
	slices.SortFunc(out, func(a, b roomChange) int { return cmpString(a.Name, b.Name) })
	return out
}

// peerRoomsGet は、取り直しの口: 手元の印 epoch と番号 since から、差分か全部を答える
func (h *Hub) peerRoomsGet(w http.ResponseWriter, r *http.Request) {
	e := h.entrance.Load()
	if e == nil {
		http.Error(w, "closed", http.StatusServiceUnavailable)
		return
	}
	ps := e.peers
	ps.mu.Lock()
	l := ps.rooms
	answer := roomsAnswer{Epoch: l.epoch, Version: l.version, Full: true}
	since, err := strconv.Atoi(r.URL.Query().Get("since"))
	if err == nil && r.URL.Query().Get("epoch") == l.epoch && since <= l.version {
		if changes, ok := changesSince(l.history, since, l.version); ok {
			answer.Full, answer.Changes = false, changes
		}
	}
	if answer.Full {
		answer.Rows = rowsOf(statesOf(l.rows))
	}
	ps.mu.Unlock()
	writeJSON(w, answer)
}

// changesSince は、番号 since から version までの変わりを 1 つにまとめた物（覚えている変わりで間に合わなければ false）
func changesSince(history []roomDiff, since, version int) ([]roomChange, bool) {
	if since == version {
		return []roomChange{}, true
	}
	i := slices.IndexFunc(history, func(d roomDiff) bool { return d.From == since })
	if i < 0 {
		return nil, false
	}
	last := map[string]roomChange{}
	for _, d := range history[i:] {
		for _, c := range d.Changes {
			last[c.Name] = c
		}
	}
	out := make([]roomChange, 0, len(last))
	for _, c := range last {
		out = append(out, c)
	}
	slices.SortFunc(out, func(a, b roomChange) int { return cmpString(a.Name, b.Name) })
	return out, true
}

// --- 相手の一覧の写し ---

// peerRoomsPost は、相手の差分を受ける口: 手元の写しと合えば当て、合わなければ取り直す
func (h *Hub) peerRoomsPost(w http.ResponseWriter, r *http.Request) {
	from, _ := peer.RequestHost(r)
	var d roomDiff
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, envelopeBodyMax)).Decode(&d); err != nil || !fitChanges(d.Changes) {
		http.Error(w, "bad workrooms", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
	e := h.entrance.Load()
	if e == nil {
		return
	}
	ps := e.peers
	ps.mu.Lock()
	c := ps.copies[from]
	applied := c != nil && c.epoch == d.Epoch && c.version == d.From
	if applied {
		ps.applyChangesLocked(c.rows, d.Changes)
		c.version = d.To
	}
	ps.mu.Unlock()
	if applied {
		h.tellPeers()
		return
	}
	go h.refetchRooms(e, from)
}

// knownActivity は、写しの行の作業の様子として受ける値（窓は、ほかの値の入った様子の知らせを読めない）
var knownActivity = map[string]bool{"working": true, "idle": true, "unknown": true}

func fitChanges(changes []roomChange) bool {
	if len(changes) > roomRowsMax {
		return false
	}
	for _, c := range changes {
		if !fitsName(c.Name) || (!c.Removed && !knownActivity[c.Activity]) {
			return false
		}
	}
	return true
}

// refetchRooms は、ペアリングしたホスト hostID の一覧を取り直す（相手ごとに 1 つだけ。取り直している間にまた頼まれたら、終わってからもう 1 度）
func (h *Hub) refetchRooms(e *hostEntrance, hostID string) {
	ps := e.peers
	ps.mu.Lock()
	if ps.fetching[hostID] != fetchIdle {
		ps.fetching[hostID] = fetchAgain
		ps.mu.Unlock()
		return
	}
	for {
		ps.fetching[hostID] = fetchBusy
		_, paired := ps.known[hostID]
		epoch, since := "", 0
		if c := ps.copies[hostID]; c != nil {
			epoch, since = c.epoch, c.version
		}
		ps.mu.Unlock()
		if paired {
			h.fetchRooms(e, hostID, epoch, since)
		}
		ps.mu.Lock()
		if ps.fetching[hostID] != fetchAgain {
			delete(ps.fetching, hostID)
			ps.mu.Unlock()
			return
		}
	}
}

// 相手ごとの取り直しの様子
const (
	fetchIdle  = 0 // 取り直していない（map に無い）
	fetchBusy  = 1 // 取り直している
	fetchAgain = 2 // 取り直している間にまた頼まれた
)

// fetchRooms は、相手の取り直しの口に頼み、答えで写しを直して窓に知らせる
func (h *Hub) fetchRooms(e *hostEntrance, hostID, epoch string, since int) {
	c, base, ok := h.peerTarget(e, hostID)
	if !ok {
		return
	}
	resp, err := c.Get(base + "/peer/v1/workrooms?epoch=" + epoch + "&since=" + strconv.Itoa(since))
	if err != nil {
		return
	}
	b, _ := io.ReadAll(io.LimitReader(resp.Body, envelopeBodyMax))
	resp.Body.Close()
	var a roomsAnswer
	if resp.StatusCode != http.StatusOK || json.Unmarshal(b, &a) != nil || len(a.Rows) > roomRowsMax || !fitChanges(a.Changes) {
		return
	}
	ps := e.peers
	ps.mu.Lock()
	if _, still := ps.known[hostID]; !still {
		ps.mu.Unlock()
		return
	}
	cp := ps.copies[hostID]
	switch {
	case a.Full:
		now := map[string]roomState{}
		for _, row := range a.Rows {
			if fitsName(row.Name) {
				now[row.Name] = roomState{row.Activity, aliveOf(row.Alive)}
			}
		}
		var was map[string]roomEntry
		if cp != nil {
			was = cp.rows
		}
		cp = &roomCopy{epoch: a.Epoch, version: a.Version, rows: ps.noteRowsLocked(was, now)}
		ps.copies[hostID] = cp
	case cp != nil && cp.epoch == a.Epoch && cp.version == since:
		ps.applyChangesLocked(cp.rows, a.Changes)
		cp.version = a.Version
	}
	ps.mu.Unlock()
	h.tellPeers()
}

// roomsOfLocked は、ペアリングしたホスト hostID の写しの行（名前の順。写しが無ければ nil。ps.mu を持って呼ぶ）
func (ps *peerState) roomsOfLocked(hostID string) []RoomRow {
	c := ps.copies[hostID]
	if c == nil {
		return nil
	}
	return rowsOf(statesOf(c.rows))
}

// peerClient は、ペアリングしたホスト hostID に、固定した鍵で頼む口
func peerClient(e *hostEntrance, hostID string) *http.Client {
	return peer.Client(e.config.Identity, hostID, int(e.proto.Load()), peerAskTimeout)
}

// --- AI が読む ---

// AI 用ホストリストに載せるこのホストのワークルームの値（core/settings.ts の LISTED_WORKROOMS）のうち、最近の hostListRows 件だけ
const listedRecent = "recent"

const (
	hostListRows = 5  // AI 用ホストリストに、ホストごとに並べる行の数（様子が最近変わった物から）
	pageRows     = 50 // 続きを読む口が 1 回に答える行の数（名前の順）
)

// WorkroomsQuery は、list_workrooms の問い: 引数なしなら AI 用ホストリスト、Name ならその名前のいる所、Paged（offset を付けた）か Host ならそのホストを名前の順に Offset から
type WorkroomsQuery struct {
	Host   string
	Name   string
	Offset int
	Paged  bool
}

// aiHostList は、AI 用ホストリスト: このホストのワークルーム（設定が recent なら最近の hostListRows 件）と残りの数、AI 用ホストリストに載せるペアリングしたホスト
// （「ほかのホストとつなぐ」が入のときだけ）。並びは様子が変わった新しい順
type aiHostList struct {
	OK        bool             `json:"ok"`
	Workrooms []RoomRow        `json:"workrooms"`
	More      int              `json:"more"`
	Hosts     *[]hostListEntry `json:"hosts,omitempty"` // 「ほかのホストとつなぐ」が切なら無し（載せるホストが無ければ空の並び）
}

// hostListEntry は、AI 用ホストリストのペアリングしたホスト 1 つ: ホストエイリアス（send_message の host に書く値）、つながっているか、最近の hostListRows 件と残りの数
type hostListEntry struct {
	Name      string    `json:"name"`
	Connected bool      `json:"connected"`
	Workrooms []RoomRow `json:"workrooms"`
	More      int       `json:"more"`
}

// workroomsNamed は、名前で引いた答え: その名前のワークルームのある所（このホストは host を書かない。AI 用ホストリストに載せないホストも入る）
type workroomsNamed struct {
	OK    bool        `json:"ok"`
	Found []foundRoom `json:"found"`
}

type foundRoom struct {
	Host     string `json:"host,omitempty"`
	Name     string `json:"name"`
	Activity string `json:"activity"`
	Alive    string `json:"alive"`
	AiUi     string `json:"aiUi,omitempty"` // このホストの行で、分かるときだけ
}

// workroomsPage は、1 つのホストを名前の順に読んだ答え（このホストなら host と connected を書かない）と、そのあとに残る数と続きの offset
type workroomsPage struct {
	OK        bool      `json:"ok"`
	Host      string    `json:"host,omitempty"`
	Connected *bool     `json:"connected,omitempty"`
	Workrooms []RoomRow `json:"workrooms"`
	More      int       `json:"more"`
	Next      *int      `json:"next,omitempty"` // 続きを読む offset（残りがあるときだけ）
}

// orderedRoom は、様子が変わった順の番号つきの行
type orderedRoom struct {
	RoomRow
	seq uint64
}

// byRecent は、様子が変わった新しい順（同じなら名前の順）に並べる
func byRecent(rows []orderedRoom) []orderedRoom {
	slices.SortFunc(rows, func(a, b orderedRoom) int {
		switch {
		case a.seq > b.seq:
			return -1
		case a.seq < b.seq:
			return 1
		}
		return cmpString(a.Name, b.Name)
	})
	return rows
}

// headOf は、並べた行の先頭 n 件（n が負なら全部）と残りの数
func headOf(rows []orderedRoom, n int) ([]RoomRow, int) {
	if n < 0 || n > len(rows) {
		n = len(rows)
	}
	out := make([]RoomRow, 0, n)
	for _, r := range rows[:n] {
		out = append(out, r.RoomRow)
	}
	return out, len(rows) - n
}

// pageOf は、名前の順の行 rows の offset からの pageRows 件の答え（そのあとに残る数と、残りがあれば続きの offset）
func pageOf(rows []RoomRow, offset int) workroomsPage {
	offset = max(0, min(offset, len(rows)))
	end := min(len(rows), offset+pageRows)
	out := workroomsPage{OK: true, Workrooms: slices.Clone(rows[offset:end]), More: len(rows) - end}
	if out.More > 0 {
		out.Next = &end
	}
	return out
}

// entriesOf は、一覧の行を番号つきで
func entriesOf(rows map[string]roomEntry) []orderedRoom {
	out := make([]orderedRoom, 0, len(rows))
	for name, r := range rows {
		out = append(out, orderedRoom{RoomRow{Name: name, Activity: r.state.activity, Alive: r.state.alive}, r.seq})
	}
	return out
}

// ownSeqs は、自分の一覧（refreshRooms が直す）の行の番号（入口が無ければ空）
func (h *Hub) ownSeqs() map[string]roomEntry {
	e := h.entrance.Load()
	if e == nil {
		return nil
	}
	e.peers.mu.Lock()
	defer e.peers.mu.Unlock()
	return maps.Clone(e.peers.rooms.rows)
}

// seqOf は、自分の一覧 known での行 name の番号。まだ載っていない行は、いちばん新しい物とする。sameState なら、様子 state の違う行も新しい物とする
func seqOf(known map[string]roomEntry, name string, state roomState, sameState bool) uint64 {
	if r, ok := known[name]; ok && (!sameState || r.state == state) {
		return r.seq
	}
	return math.MaxUint64
}

// ownRooms は、このホストの今の一覧（参加の確定した AI のいるワークルーム。AI の UI が分かれば添える）を、様子が変わった順の番号つきで
func (h *Hub) ownRooms() ([]orderedRoom, error) {
	list, err := h.roomsNow(time.Now())
	if err != nil {
		return nil, err
	}
	known := h.ownSeqs()
	out := make([]orderedRoom, 0, len(list.states))
	for name, st := range list.states {
		out = append(out, orderedRoom{RoomRow{Name: name, Activity: st.activity, Alive: st.alive, AiUi: list.uis[name]}, seqOf(known, name, st, true)})
	}
	return out, nil
}

// pairedRooms は、ペアリングしたホストみなの写し（つながっているホストだけ行がある。ps.mu を 1 度持って、つながりと行を同じ時点で読む）
type pairedRooms struct {
	hostID    string
	label     string
	connected bool
	listed    bool
	rows      []orderedRoom
}

func (h *Hub) pairedRoomsNow() []pairedRooms {
	e := h.entrance.Load()
	if e == nil || !h.HostStatus().Open {
		return nil
	}
	ps := e.peers
	ps.mu.Lock()
	defer ps.mu.Unlock()
	labels := ps.labelsLocked()
	out := make([]pairedRooms, 0, len(ps.known))
	for id, r := range ps.known {
		p := pairedRooms{hostID: id, label: labels[id], listed: r.Listed != hostHidden, rows: []orderedRoom{}}
		if l := ps.live[id]; l != nil && l.State == PeerConnected {
			p.connected = true
			if c := ps.copies[id]; c != nil {
				p.rows = entriesOf(c.rows)
			}
		}
		out = append(out, p)
	}
	slices.SortFunc(out, func(a, b pairedRooms) int { return cmpString(a.label, b.label) })
	return out
}

// Workrooms は、AI が送れるワークルームの一覧（aiHostList・workroomsNamed・workroomsPage か、断りの MessageSent）。ほかのホストは写しから答える（相手に聞かない）
func (h *Hub) Workrooms(q WorkroomsQuery) (any, error) {
	if q.Name != "" && (q.Host != "" || q.Paged) {
		return MessageSent{Reason: "bad-arguments", Detail: "name is given alone, without host or offset"}, nil
	}
	if q.Name != "" {
		return h.workroomsNamed(q.Name)
	}
	if q.Host != "" {
		return h.hostPage(q.Host, q.Offset)
	}
	own, err := h.ownRooms()
	if err != nil {
		return nil, err
	}
	if q.Paged {
		return pageOf(nameOrder(own), q.Offset), nil
	}
	limit := -1
	if settings, _ := h.Data(); settings != nil {
		if s, err := h.engine.HostSettingsOf(settings); err == nil && s.ListedWorkrooms == listedRecent {
			limit = hostListRows
		}
	}
	out := aiHostList{OK: true}
	out.Workrooms, out.More = headOf(byRecent(own), limit)
	if paired := h.pairedRoomsNow(); paired != nil {
		hosts := []hostListEntry{}
		for _, p := range paired {
			if !p.listed {
				continue
			}
			o := hostListEntry{Name: p.label, Connected: p.connected}
			o.Workrooms, o.More = headOf(byRecent(p.rows), hostListRows)
			hosts = append(hosts, o)
		}
		out.Hosts = &hosts
	}
	return out, nil
}

// nameOrder は、行を名前の順に
func nameOrder(rows []orderedRoom) []RoomRow {
	out := make([]RoomRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.RoomRow)
	}
	slices.SortFunc(out, func(a, b RoomRow) int { return cmpString(a.Name, b.Name) })
	return out
}

// workroomsNamed は、名前 name のワークルームのある所: このホストと、ペアリングしたホストみな（AI 用ホストリストに載せないホストも）
func (h *Hub) workroomsNamed(name string) (any, error) {
	own, err := h.ownRooms()
	if err != nil {
		return nil, err
	}
	out := workroomsNamed{OK: true, Found: []foundRoom{}}
	for _, r := range own {
		if r.Name == name {
			out.Found = append(out.Found, foundRoom{Name: r.Name, Activity: r.Activity, Alive: r.Alive, AiUi: r.AiUi})
		}
	}
	for _, p := range h.pairedRoomsNow() {
		for _, r := range p.rows {
			if r.Name == name {
				out.Found = append(out.Found, foundRoom{Host: p.label, Name: r.Name, Activity: r.Activity, Alive: r.Alive})
			}
		}
	}
	return out, nil
}

// hostPage は、ホストエイリアス host のペアリングしたホストの写しを、名前の順に offset から（つながっていなければ行なし）
func (h *Hub) hostPage(host string, offset int) (any, error) {
	_, target, refused := h.pairedByLabel(host)
	if target == nil {
		return refused, nil
	}
	for _, p := range h.pairedRoomsNow() {
		if p.hostID == target.HostID {
			out := pageOf(nameOrder(p.rows), offset)
			out.Host, out.Connected = host, &p.connected
			return out, nil
		}
	}
	return MessageSent{Reason: "unknown-host", Detail: "no paired host is named " + host}, nil // 引いたあとにペアリングを解かれた
}

// hostsWithRoom は、名前 name のワークルームのあるペアリングしたホストのホストエイリアス（名前の順。AI 用ホストリストに載せないホストも）
func (h *Hub) hostsWithRoom(name string) []string {
	var out []string
	for _, p := range h.pairedRoomsNow() {
		if slices.ContainsFunc(p.rows, func(r orderedRoom) bool { return r.Name == name }) {
			out = append(out, p.label)
		}
	}
	return out
}

// sendableClause は、断りに添える送れる先の句: このホストの名前の並び names（参加の確定した AI のいるワークルーム）の、様子が変わった順の最近の hostListRows 件
// （残りがあれば、その数と、全部を読む口 readAll）。names が無ければ none
func (h *Hub) sendableClause(names []string, readAll, none string) string {
	if len(names) == 0 {
		return none
	}
	known := h.ownSeqs()
	rows := make([]orderedRoom, 0, len(names))
	for _, n := range names {
		rows = append(rows, orderedRoom{RoomRow{Name: n}, seqOf(known, n, roomState{}, false)})
	}
	head, more := headOf(byRecent(rows), hostListRows)
	shown := make([]string, 0, len(head))
	for _, r := range head {
		shown = append(shown, r.Name)
	}
	out := "you can send to: " + strings.Join(shown, ", ")
	if more > 0 {
		out += fmt.Sprintf(" and %d more (%s lists them all)", more, readAll)
	}
	return out
}

// pairedByLabel は、ホストエイリアス label のペアリングしたホストを引く。引けなければ target は nil で、AI への断り（host-closed・unknown-host）を返す
func (h *Hub) pairedByLabel(label string) (*hostEntrance, *pairedHostRecord, MessageSent) {
	e := h.entrance.Load()
	if e == nil || !h.HostStatus().Open {
		return nil, nil, MessageSent{Reason: "host-closed", Detail: "this host does not connect to other hosts now (the user's setting is off)"}
	}
	target, labels := e.peers.byLabel(label)
	if target == nil {
		detail := "no paired host is named " + label
		if len(labels) > 0 {
			detail += "; the paired hosts are: " + strings.Join(labels, ", ")
		} else {
			detail += "; this host is paired with no host"
		}
		return e, nil, MessageSent{Reason: "unknown-host", Detail: detail}
	}
	return e, target, MessageSent{}
}

func rowsOf(rows map[string]roomState) []RoomRow {
	out := make([]RoomRow, 0, len(rows))
	for name, st := range rows {
		out = append(out, RoomRow{Name: name, Activity: st.activity, Alive: st.alive})
	}
	slices.SortFunc(out, func(a, b RoomRow) int { return cmpString(a.Name, b.Name) })
	return out
}

func (o Options) aiWorkrooms(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	query := WorkroomsQuery{Host: q.Get("host"), Name: q.Get("name")}
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			http.Error(w, "bad offset", http.StatusBadRequest)
			return
		}
		query.Offset, query.Paged = n, true
	}
	out, err := o.Hub.Workrooms(query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, out)
}
