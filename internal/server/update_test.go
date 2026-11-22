package server

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
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
	h := emptyHub(t)
	latest, _ := fakeLatest("1.1.0", true, nil)
	h.SetUpdateCheck("1.0.0", latest)
	if s := h.UpdateStatus(); s.State != UpdateUnchecked || s.Version != "1.0.0" {
		t.Fatalf("before = %+v", s)
	}
	w := h.Join()
	<-w.ch // hello
	s := h.CheckUpdate(context.Background())
	if s.State != UpdateNewer || s.Latest != "1.1.0" || s.CheckedAt == "" {
		t.Fatalf("after = %+v", s)
	}
	e := <-w.ch
	var told UpdateStatus
	if err := json.Unmarshal(e.data, &told); e.name != "update-status" || err != nil || told != s {
		t.Fatalf("told %s %s", e.name, e.data)
	}
}

func TestAFailedCheckShowsOnlyWhenTheUserAsked(t *testing.T) {
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
	if s := h.CheckUpdate(context.Background()); s.State != UpdateFailed || s.Latest != "1.1.0" {
		t.Fatalf("the user's check that failed = %+v", s)
	}
}

func TestTheServerChecksOnlyWhenTheSettingAllowsAndNotForDevBuilds(t *testing.T) {
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
	if s := h.CheckUpdate(context.Background()); s.State != UpdateDev {
		t.Fatalf("dev = %+v", s)
	}
}
