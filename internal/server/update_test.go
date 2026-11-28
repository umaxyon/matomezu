package server

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

// fakeLatest は、答え latest・newer・err を返し、呼ばれた数を数える口
func fakeLatest(latest string, newer bool, err error) (LatestFunc, *int) {
	calls := 0
	return func(context.Context) (string, bool, error) {
		calls++
		return latest, newer, err
	}, &calls
}

func TestCheckUpdateTellsTheWindows(t *testing.T) {
	t.Parallel()
	h := emptyHub(t)
	latest, _ := fakeLatest("1.1.0", true, nil)
	h.SetUpdateCheck("1.0.0", latest)
	if s := h.UpdateStatus(); s.State != UpdateUnchecked || s.Version != "1.0.0" {
		t.Fatalf("before = %+v", s)
	}
	w := h.Join()
	<-w.ch // hello
	s, _ := h.CheckUpdate(context.Background())
	if s.State != UpdateNewer || s.Latest != "1.1.0" || s.CheckedAt == "" {
		t.Fatalf("after = %+v", s)
	}
	e := <-w.ch
	var told UpdateStatus
	if err := json.Unmarshal(e.data, &told); e.name != "update-status" || err != nil || told != s {
		t.Fatalf("told %s %s", e.name, e.data)
	}
}

// 更新の様子の知らせは、窓の出入りと重なっても窓の並びを h.mu で守る（go test -race で留める）
func TestUpdateStatusIsToldUnderTheLockWhileWindowsComeAndGo(t *testing.T) {
	t.Parallel()
	h := emptyHub(t)
	latest, _ := fakeLatest("1.1.0", true, nil)
	h.SetUpdateCheck("1.0.0", latest)
	done := make(chan struct{})
	go func() {
		defer close(done)
		for range 200 {
			h.Leave(h.Join())
		}
	}()
	for range 200 {
		h.CheckUpdate(context.Background())
	}
	<-done
}

// 聞けなかった確かめは、頼んだかによらず前の結果（新しい版）を残す。利用者が頼んだときだけ誤りを返す
func TestAFailedCheckKeepsTheLastResult(t *testing.T) {
	t.Parallel()
	h := emptyHub(t)
	ok, _ := fakeLatest("1.1.0", true, nil)
	h.SetUpdateCheck("1.0.0", ok)
	h.CheckUpdate(context.Background())
	failing, _ := fakeLatest("", false, errors.New("offline"))
	h.latest = failing
	h.CheckUpdateIfOn(context.Background())
	if s := h.UpdateStatus(); s.State != UpdateNewer {
		t.Fatalf("the server's own check that failed changed the state: %+v", s)
	}
	if s, err := h.CheckUpdate(context.Background()); err == nil || s.State != UpdateNewer || s.Latest != "1.1.0" {
		t.Fatalf("the user's check that failed = %+v, %v", s, err)
	}
}

func TestTheServerChecksOnlyWhenTheSettingAllowsAndNotForDevBuilds(t *testing.T) {
	t.Parallel()
	h := emptyHub(t)
	latest, calls := fakeLatest("1.0.0", false, nil)
	h.SetUpdateCheck("1.0.0", latest)
	h.CheckUpdateIfOn(context.Background())
	if *calls != 1 {
		t.Fatalf("checked %d times with the default setting", *calls)
	}
	if out, err := h.Perform(performOne("@matomezu/base:settings-set", json.RawMessage(`{"values":{"@matomezu/base:update-check":false}}`), nil)); err != nil || !out.OK {
		t.Fatalf("settings-set = %+v, %v", out, err)
	}
	h.CheckUpdateIfOn(context.Background())
	if *calls != 1 {
		t.Fatal("checked after the user turned it off")
	}
	h.CheckUpdate(context.Background())
	if *calls != 2 {
		t.Fatal("did not check when the user asked")
	}
	h.SetUpdateCheck("dev", nil)
	if s, _ := h.CheckUpdate(context.Background()); s.State != UpdateDev {
		t.Fatalf("dev = %+v", s)
	}
}

// roomOf は、参加者 participant が受け入れられたワークルームの id
func roomOf(t *testing.T, url, participant string) string {
	t.Helper()
	for _, body := range recordsOf(t, url, "@matomezu/base:participant") {
		if body["id"] == participant {
			room, _ := body["workroom"].(string)
			return room
		}
	}
	t.Fatalf("no participant %s", participant)
	return ""
}

// 頼んだら、そのワークルームの AI に 1 つだけ流れ（渡せたと返っていない前の頼みがあれば足さない）、呼び出しの返事でも渡り、頼んだ時刻を知らせる。AI のいないワークルームは断る
func TestAskUpdateWakesTheWorkroomsAI(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	hub.SetUpdateCheck("1.0.0", nil)
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	noticeOf(t, s.URL, a)
	room := roomOf(t, s.URL, a)
	for range 2 {
		if ok, err := hub.AskUpdate(room, time.Now()); !ok || err != nil {
			t.Fatalf("AskUpdate = %v, %v", ok, err)
		}
	}
	if hub.UpdateStatus().AskedAt == "" {
		t.Fatal("the time is not kept")
	}
	if n := noticeOf(t, s.URL, a); strings.Count(n, "matomezu update") != 1 {
		t.Fatalf("notice = %q", n)
	}
	hub.AskUpdate(room, time.Now())
	if got := wakes(hub, hub.OpenWakesWith("100", "", "", WakeLimits{})); len(got) != 1 || got[0] != askUpdateLine("matomezu") {
		t.Fatalf("wakes = %q", got)
	}
	if ok, err := hub.AskUpdate("no-room", time.Now()); ok || err != nil {
		t.Fatalf("a room without an AI = %v, %v", ok, err)
	}
}
