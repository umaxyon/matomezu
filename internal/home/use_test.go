package home

import "testing"

// 覚えたほかの OS の常駐は、書いて読み戻せ、やめれば無くなる（無いときに消しても失敗しない）
func TestUseRoundTrip(t *testing.T) {
	h, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if u, err := h.ReadUse(); err != nil || u != nil {
		t.Fatalf("none: %v, %v", u, err)
	}
	want := Use{OS: UseWSL, Distro: "Ubuntu-24.04", Vault: `\\wsl.localhost\Ubuntu-24.04\home\me\.matomezu`}
	if err := h.WriteUse(want); err != nil {
		t.Fatal(err)
	}
	if u, err := h.ReadUse(); err != nil || u == nil || *u != want {
		t.Fatalf("read: %v, %v", u, err)
	}
	for range 2 {
		if err := h.RemoveUse(); err != nil {
			t.Fatal(err)
		}
	}
	if u, err := h.ReadUse(); err != nil || u != nil {
		t.Fatalf("removed: %v, %v", u, err)
	}
}
