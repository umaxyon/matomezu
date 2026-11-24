package home

import "testing"

// 覚えた相手の常駐は、書いて読み戻せ、やめれば無くなる（無いときに消しても失敗しない）
func TestCounterpartRoundTrip(t *testing.T) {
	h, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if u, err := h.ReadCounterpart(); err != nil || u != nil {
		t.Fatalf("none: %v, %v", u, err)
	}
	want := Counterpart{OS: CounterpartWSL, Distro: "Ubuntu-24.04", Vault: `\\wsl.localhost\Ubuntu-24.04\home\me\.matomezu`}
	if err := h.WriteCounterpart(want); err != nil {
		t.Fatal(err)
	}
	if u, err := h.ReadCounterpart(); err != nil || u == nil || *u != want {
		t.Fatalf("read: %v, %v", u, err)
	}
	for range 2 {
		if err := h.RemoveCounterpart(); err != nil {
			t.Fatal(err)
		}
	}
	if u, err := h.ReadCounterpart(); err != nil || u != nil {
		t.Fatalf("removed: %v, %v", u, err)
	}
}
