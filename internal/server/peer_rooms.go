package server

// ほかのホストとのワークルームの一覧: 常駐どうしが、自分の一覧（参加の確定した AI のいるワークルームの名前と、作業中・空き）の変わった所だけを送り合い、
// 相手の一覧の写しを常駐だけが持つ（起動し直すと消え、つながったときに取り直す）。AI の指示は挟まず、間を置いて送り続けない。
// 自分の一覧は、レコードか参加者の様子が変わったら（kickRooms）少し待ってまとめて作り直し、変わっていれば番号を 1 つ上げ、つながっているペアリングしたホストに差分を送る。
// 届かない差分は捨てる（次につながったときの取り直しで埋まる）。受けた側は、手元の起動の印と番号が差分の「前」と合えば当て、合わなければ取り直す。
// 取り直すのは、相手とつながったと分かったとき（相手の hello の口に通った・相手がこちらの hello の口に来た）と、差分が当たらなかったときだけ。
// 写しは、list_workrooms と、画面のほかのホストの行が使う（相手に聞かずに答える）。つながっていない相手の写しは出さない
//
//	POST /peer/v1/workrooms 差分 {"epoch", "from", "to", "changes": [{"name", "activity"} か {"name", "removed": true}]}  204
//	GET  /peer/v1/workrooms?epoch=&since=  {"epoch", "version", "full", "rows"（full のとき）, "changes"（full でないとき）}
//	  手元の印が今の起動の物で、since からの変わりを覚えていれば（直近 roomHistoryMax 回分）差分、ほかは全部

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/peer"
)

const (
	roomHistoryMax = 100                    // 差分で答えるために覚える、近い変わりの数
	roomRowsMax    = 500                    // 受ける一覧の行の上限
	roomsSettle    = 200 * time.Millisecond // 続いた変わりを 1 回にまとめて待つ間
)

// RoomRow は、ワークルームの一覧の 1 行: 名前と作業の様子（working・idle・unknown）
type RoomRow struct {
	Name     string `json:"name"`
	Activity string `json:"activity"`
}

// roomChange は、差分の 1 行: 足す・変わる行は名前と様子、消える行は名前と removed
type roomChange struct {
	Name     string `json:"name"`
	Activity string `json:"activity,omitempty"`
	Removed  bool   `json:"removed,omitempty"`
}

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

// roomCopy は、相手の一覧の写し
type roomCopy struct {
	epoch   string
	version int
	rows    map[string]string // 名前 → 様子
}

// localRooms は、自分の一覧（番号つき）と近い変わり
type localRooms struct {
	epoch   string
	version int
	rows    map[string]string
	history []roomDiff // 古い順。どれも From+1 == To で続いている
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

// roomsNow は、今の自分の一覧（参加の確定した AI のいるワークルームの名前 → 様子）
func (h *Hub) roomsNow() (map[string]string, error) {
	records, err := h.records()
	if err != nil {
		return nil, err
	}
	rooms, err := h.workrooms()
	if err != nil {
		return nil, err
	}
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
		return nil, err
	}
	out := map[string]string{}
	for _, r := range rooms {
		if occupant[r.ID] != "" {
			out[r.Name] = activity[r.ID]
		}
	}
	return out, nil
}

// refreshRooms は、自分の一覧を作り直し、変わっていれば番号を上げて、つながっているペアリングしたホストに差分を送る（届かなければ捨てる）
func (h *Hub) refreshRooms(e *hostEntrance) {
	now, err := h.roomsNow()
	if err != nil {
		fmt.Fprintln(os.Stderr, "hosts: could not list the workrooms:", err)
		return
	}
	ps := e.peers
	ps.mu.Lock()
	l := &ps.rooms
	changes := roomChanges(l.rows, now)
	if len(changes) == 0 {
		ps.mu.Unlock()
		return
	}
	d := roomDiff{Epoch: l.epoch, From: l.version, To: l.version + 1, Changes: changes}
	l.version, l.rows = d.To, now
	l.history = append(l.history, d)
	if len(l.history) > roomHistoryMax {
		l.history = l.history[1:]
	}
	type target struct{ hostID, addr string }
	var targets []target
	for id, r := range ps.known {
		if lv := ps.live[id]; lv != nil && lv.Connected {
			addr := r.Addr
			if lv.Addr != "" {
				addr = lv.Addr
			}
			if addr != "" {
				targets = append(targets, target{id, addr})
			}
		}
	}
	ps.mu.Unlock()
	body := mustJSON(d)
	for _, t := range targets {
		c := peerClient(e, t.hostID)
		resp, err := c.Post("https://"+t.addr+"/peer/v1/workrooms", "application/json", bytes.NewReader(body))
		if err != nil {
			continue
		}
		resp.Body.Close()
	}
}

// roomChanges は、一覧 was から now への変わった行（名前の順）
func roomChanges(was, now map[string]string) []roomChange {
	var out []roomChange
	for name, a := range now {
		if old, ok := was[name]; !ok || old != a {
			out = append(out, roomChange{Name: name, Activity: a})
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
		answer.Rows = rowsOf(l.rows)
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
		applyChanges(c.rows, d.Changes)
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

func applyChanges(rows map[string]string, changes []roomChange) {
	for _, c := range changes {
		if c.Removed {
			delete(rows, c.Name)
		} else {
			rows[c.Name] = c.Activity
		}
	}
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
		r, paired := ps.known[hostID]
		addr := r.Addr
		if l := ps.live[hostID]; l != nil && l.Addr != "" {
			addr = l.Addr
		}
		epoch, since := "", 0
		if c := ps.copies[hostID]; c != nil {
			epoch, since = c.epoch, c.version
		}
		ps.mu.Unlock()
		if paired && addr != "" {
			h.fetchRooms(e, hostID, addr, epoch, since)
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
func (h *Hub) fetchRooms(e *hostEntrance, hostID, addr, epoch string, since int) {
	c := peerClient(e, hostID)
	resp, err := c.Get("https://" + addr + "/peer/v1/workrooms?epoch=" + epoch + "&since=" + strconv.Itoa(since))
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
		cp = &roomCopy{epoch: a.Epoch, version: a.Version, rows: map[string]string{}}
		for _, row := range a.Rows {
			if fitsName(row.Name) {
				cp.rows[row.Name] = row.Activity
			}
		}
		ps.copies[hostID] = cp
	case cp != nil && cp.epoch == a.Epoch && cp.version == since:
		applyChanges(cp.rows, a.Changes)
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
	return rowsOf(c.rows)
}

// peerClient は、ペアリングしたホスト hostID に、固定した鍵で頼む口
func peerClient(e *hostEntrance, hostID string) *http.Client {
	return peer.Client(e.config.Identity, hostID, peerAskTimeout)
}

// --- AI が読む ---

// workroomsAnswer は、list_workrooms の答え
type workroomsAnswer struct {
	OK        bool        `json:"ok"`
	Reason    string      `json:"reason,omitempty"`
	Detail    string      `json:"detail,omitempty"`
	Host      string      `json:"host,omitempty"`      // host を付けたとき: そのホストの呼び名
	Connected *bool       `json:"connected,omitempty"` // host を付けたとき: つながっているか（つながっていなければ workrooms は無い）
	Workrooms []RoomRow   `json:"workrooms"`
	Hosts     []hostBrief `json:"hosts,omitempty"` // host を付けないとき: ペアリングしたホスト
}

type hostBrief struct {
	Name      string `json:"name"` // 呼び名（send_message の host に書く値）
	Connected bool   `json:"connected"`
}

// Workrooms は、送れるワークルームの一覧。host が空なら、このホストの一覧（参加の確定した AI のいるワークルーム）と、ペアリングしたホストの呼び名
// （「ほかのホストとつなぐ」が入のときだけ）。host があれば、その呼び名のペアリングしたホストの写し（相手に聞かない）
func (h *Hub) Workrooms(host string) (workroomsAnswer, error) {
	e := h.entrance.Load()
	open := e != nil && h.HostStatus().Open
	if host == "" {
		rows, err := h.roomsNow()
		if err != nil {
			return workroomsAnswer{}, err
		}
		out := workroomsAnswer{OK: true, Workrooms: rowsOf(rows)}
		if open {
			out.Hosts = []hostBrief{}
			for _, p := range h.HostPeers().Paired {
				out.Hosts = append(out.Hosts, hostBrief{Name: p.Label, Connected: p.Connected})
			}
			slices.SortFunc(out.Hosts, func(a, b hostBrief) int { return cmpString(a.Name, b.Name) })
		}
		return out, nil
	}
	if !open {
		return workroomsAnswer{Reason: "host-closed", Detail: "this host does not connect to other hosts now (the user's setting is off)"}, nil
	}
	target, labels := e.peers.byLabel(host)
	if target == nil {
		detail := "no paired host is named " + host
		if len(labels) > 0 {
			detail += "; the paired hosts are: " + strings.Join(labels, ", ")
		} else {
			detail += "; this host is paired with no host"
		}
		return workroomsAnswer{Reason: "unknown-host", Detail: detail}, nil
	}
	ps := e.peers
	ps.mu.Lock()
	connected := ps.live[target.HostID] != nil && ps.live[target.HostID].Connected
	rows := []RoomRow{}
	if connected {
		if r := ps.roomsOfLocked(target.HostID); r != nil {
			rows = r
		}
	}
	ps.mu.Unlock()
	return workroomsAnswer{OK: true, Host: host, Connected: &connected, Workrooms: rows}, nil
}

func rowsOf(rows map[string]string) []RoomRow {
	out := make([]RoomRow, 0, len(rows))
	for name, a := range rows {
		out = append(out, RoomRow{Name: name, Activity: a})
	}
	slices.SortFunc(out, func(a, b RoomRow) int { return cmpString(a.Name, b.Name) })
	return out
}

func (o Options) aiWorkrooms(w http.ResponseWriter, r *http.Request) {
	out, err := o.Hub.Workrooms(r.URL.Query().Get("host"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, out)
}
