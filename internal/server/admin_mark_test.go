package server

import (
	"strings"
	"testing"
)

// 同じホストの管理者の頼みに印が付くのは、利用者が王冠で選んだ管理者だけ（受け入れで自動に付いた管理者には付かない）。
// 選び直すと、印は新しい管理者に移る
func TestAdminMarkFollowsTheUserChoice(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ") // 最初の受け入れで自動的に管理者
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	noticeOf(t, s.URL, a)
	noticeOf(t, s.URL, b)

	roomB := ""
	for id, r := range recordsOf(t, s.URL, "@matomezu/base:workroom") {
		if r["name"] == "すずめ" {
			roomB = id
		}
	}
	if roomB == "" {
		t.Fatal("the workroom すずめ is not there")
	}

	// 自動で決まった管理者の頼みには、印が付かない
	if sent, _ := sendMessage(t, s.URL, a, "すずめ", "自動"); !sent.OK {
		t.Fatalf("sent = %+v", sent)
	}
	if got := wakes(hub, hub.OpenWakesWith("200", "", WakeLimits{})); strings.Join(got, "|") != `matomezu from AI "ひよこ": "自動"` {
		t.Fatalf("before the choice, wakes = %q", got)
	}

	// 利用者が「すずめ」を管理者に選ぶと、そこからの頼みに印が付く
	if _, got := postPerform(t, s.URL, `{"action":"@matomezu/base:admin-set","args":{"workroom":"`+roomB+`"},"on":{"record":"admin"},"lang":"ja","now":"2026-11-08T01:01:00.000Z"}`); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("admin-set = %s", got)
	}
	if sent, _ := sendMessage(t, s.URL, b, "ひよこ", "頼み"); !sent.OK {
		t.Fatalf("sent = %+v", sent)
	}
	if got := wakes(hub, hub.OpenWakesWith("100", "", WakeLimits{})); strings.Join(got, "|") != `matomezu from AI "すずめ" (as your user's request): "頼み"` {
		t.Fatalf("after the choice, wakes = %q", got)
	}
}
