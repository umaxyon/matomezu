package server

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/aiwire"
	"github.com/umaxyon/matomezu/internal/engine"
)

// ownRoomAt は、時点 at の自分の一覧の行 name の様子
func ownRoomAt(t *testing.T, h *Hub, at time.Time, name string) (roomState, time.Time) {
	t.Helper()
	list, err := h.roomsNow(at)
	if err != nil {
		t.Fatal(err)
	}
	return list.states[name], list.nextLapse
}

// 一覧の生きているか: 最後に呼ばれてから参加の有効時間（既定 60 分）は生きていて、過ぎる時点を作り直しの予約に返す。起こす知らせを渡せる通り道がつながっていれば、
// 時間を過ぎても生きている。その会話が無いと答えた通り道は数えず、次に渡せたら戻す。send_message の delivers も同じ通り道で決まる
func TestRoomsTellWhetherTheAIIsAlive(t *testing.T) {
	s, h := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	now := time.Now()
	if st, _ := ownRoomAt(t, h, now, "すずめ"); st.alive != roomLapsed {
		t.Fatalf("not called yet = %+v", st)
	}
	call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{aiwire.ParticipantHeader: b})
	st, lapses := ownRoomAt(t, h, now, "すずめ")
	if st.alive != roomAlive || lapses.Sub(now) < 59*time.Minute || lapses.Sub(now) > 61*time.Minute {
		t.Fatalf("called = %+v, lapses in %v", st, lapses.Sub(now))
	}
	later := now.Add(61 * time.Minute)
	if st, _ := ownRoomAt(t, h, later, "すずめ"); st.alive != roomLapsed {
		t.Fatalf("after the time = %+v", st)
	}
	if sent, _ := sendMessage(t, s.URL, a, "すずめ", "一つ目"); sent.Delivers != aiwire.DeliversNextCall {
		t.Fatalf("sent without a line = %+v", sent)
	}
	line := h.OpenWakesWith("200", "", WakeLimits{})
	if st, lapses := ownRoomAt(t, h, later, "すずめ"); st.alive != roomAlive || !lapses.IsZero() {
		t.Fatalf("with a line = %+v, %v", st, lapses)
	}
	// 通り道が、その会話は無いと答えると、その通り道では生きていない
	it, ok := h.nextWake(line, time.Now())
	if !ok {
		t.Fatal("nothing on the line")
	}
	h.AckWake(line.id, it.ID, WakeAbsent, time.Now())
	if st, _ := ownRoomAt(t, h, later, "すずめ"); st.alive != roomLapsed {
		t.Fatalf("absent = %+v", st)
	}
	if sent, _ := sendMessage(t, s.URL, a, "すずめ", "二つ目"); sent.Delivers != aiwire.DeliversNextCall {
		t.Fatalf("sent after absent = %+v", sent)
	}
	// 次に渡せたら戻る
	it, ok = h.nextWake(line, time.Now())
	if !ok {
		t.Fatal("the second is not on the line")
	}
	h.AckWake(line.id, it.ID, WakeDelivered, time.Now())
	if st, _ := ownRoomAt(t, h, later, "すずめ"); st.alive != roomAlive {
		t.Fatalf("delivered again = %+v", st)
	}
	if sent, _ := sendMessage(t, s.URL, a, "すずめ", "三つ目"); sent.Delivers != aiwire.DeliversNow {
		t.Fatalf("sent with the line = %+v", sent)
	}
	if h.ParticipantLive()[b].Wake != engine.WakeReaches {
		t.Fatalf("live with a line = %+v", h.ParticipantLive()[b])
	}
	// 通り道が切れると、呼ばれた時刻だけで決まる
	h.CloseWakes(line)
	if h.ParticipantLive()[b].Wake != "" {
		t.Fatalf("live after the line closed = %+v", h.ParticipantLive()[b])
	}
	if st, _ := ownRoomAt(t, h, later, "すずめ"); st.alive != roomLapsed {
		t.Fatalf("line closed = %+v", st)
	}
	// 通り道がつながっている参加者のワークルームは、引き継げない
	h.OpenWakesWith("200", "", WakeLimits{})
	if alive, err := h.alive(b, later); err != nil || !alive {
		t.Fatalf("alive with a line = %v, %v", alive, err)
	}
}

// 古い版の相手は生きているかを送らない: 差分の行・取り直しの行に無ければ unknown と読む。知らない値も unknown
func TestRoomsFromAnOldPeerAreUnknownAlive(t *testing.T) {
	var d roomDiff
	if err := json.Unmarshal([]byte(`{"epoch":"e","from":0,"to":1,"changes":[{"name":"x","activity":"idle"},{"name":"y","activity":"working","alive":"dozing"}]}`), &d); err != nil || !fitChanges(d.Changes) {
		t.Fatalf("diff = %+v, %v", d, err)
	}
	ps := &peerState{}
	rows := map[string]roomEntry{}
	ps.applyChangesLocked(rows, d.Changes)
	if rows["x"].state != (roomState{"idle", roomUnknown}) || rows["y"].state != (roomState{"working", roomUnknown}) {
		t.Fatalf("rows = %+v", rows)
	}
	// 生きているかだけが変わった行も、作業の様子を運ぶ（古い版の相手は、作業の様子の無い行を受けない）
	changes := roomChanges(map[string]roomState{"x": {"idle", roomAlive}}, map[string]roomState{"x": {"idle", roomLapsed}})
	if len(changes) != 1 || changes[0] != (roomChange{Name: "x", Activity: "idle", Alive: roomLapsed}) {
		t.Fatalf("changes = %+v", changes)
	}
}

// 同じ参加者に届く通り道が 2 本あれば、absent はそれぞれの通り道で覚える: 2 本とも absent なら生きていない、どちらかで渡せたら生きている
func TestAbsentIsKeptForEachLine(t *testing.T) {
	s, h := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	later := time.Now().Add(61 * time.Minute)
	first := h.OpenWakesWith("200", "", WakeLimits{})
	second := h.OpenWakesWith("200", "", WakeLimits{})
	if st, _ := ownRoomAt(t, h, later, "すずめ"); st.alive != roomAlive {
		t.Fatalf("two lines = %+v", st)
	}
	answer := func(l *wakeLine, result string) {
		t.Helper()
		it, ok := h.nextWake(l, time.Now())
		if !ok {
			t.Fatal("nothing on the line")
		}
		h.AckWake(l.id, it.ID, result, time.Now())
	}
	sendMessage(t, s.URL, a, "すずめ", "一つ目")
	answer(first, WakeAbsent)
	if st, _ := ownRoomAt(t, h, later, "すずめ"); st.alive != roomAlive {
		t.Fatalf("one line absent = %+v", st)
	}
	sendMessage(t, s.URL, a, "すずめ", "二つ目")
	answer(second, WakeAbsent)
	if st, _ := ownRoomAt(t, h, later, "すずめ"); st.alive != roomLapsed {
		t.Fatalf("both absent = %+v", st)
	}
	sendMessage(t, s.URL, a, "すずめ", "三つ目")
	answer(first, WakeDelivered)
	if st, _ := ownRoomAt(t, h, later, "すずめ"); st.alive != roomAlive {
		t.Fatalf("delivered on the first = %+v", st)
	}
}
