package server

import (
	"strings"
	"testing"
)

// 画面から引継ぎを頼むと、会話を空にできると名乗った参加者にだけ、利用者の頼みの印を付けた起こす知らせが 1 つ流れる（渡せたと返っていない前の頼みがあれば足さない）。
// 名乗っていない参加者とワークルームの AI でない参加者は断り、何も流さない。名乗ると、参加者の様子に refreshable が載る
func TestAskRefreshWakesOnlyARefreshableAI(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	noticeOf(t, s.URL, a)
	ask := func(participant string) string {
		got, _ := call(t, "POST", s.URL+"/api/participants/ask-refresh", `{"participant":"`+participant+`"}`, nil)
		return got
	}
	if got := ask(a); !strings.Contains(got, `"reason":"not-refreshable"`) {
		t.Fatalf("ask-refresh before the announcement = %s", got)
	}
	if got := ask("nobody"); !strings.Contains(got, `"reason":"no-recipient"`) {
		t.Fatalf("ask-refresh to nobody = %s", got)
	}
	if got := wakes(hub, hub.OpenWakesWith("100", "", WakeLimits{})); len(got) != 0 {
		t.Fatalf("wakes after the refusals = %q", got)
	}
	if hub.ParticipantLive()[a].Refreshable {
		t.Fatal("refreshable before the announcement")
	}
	if got, _ := call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"SA","refreshable":true}`, nil); got == "" {
		t.Fatal("talked answered nothing")
	}
	if !hub.ParticipantLive()[a].Refreshable {
		t.Fatal("the announcement is not in the participant's live state")
	}
	for range 2 {
		if got := ask(a); !strings.Contains(got, `"ok":true`) {
			t.Fatalf("ask-refresh = %s", got)
		}
	}
	got := wakes(hub, hub.OpenWakesWith("100", "", WakeLimits{}))
	if len(got) != 1 || got[0] != askRefreshLine() || !strings.Contains(got[0], asUserMark) || !strings.Contains(got[0], refreshAction) {
		t.Fatalf("wakes = %q", got)
	}
}
