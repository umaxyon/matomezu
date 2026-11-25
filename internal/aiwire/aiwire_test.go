package aiwire

import "testing"

// 受け取った delivers は、知っている値だけを残し、無いか知らない値（古い版の常駐・ほかのホスト）は unknown と読む
func TestKnownDelivers(t *testing.T) {
	for in, want := range map[string]string{"now": DeliversNow, "next-call": DeliversNextCall, "": DeliversUnknown, "later": DeliversUnknown} {
		if got := KnownDelivers(in); got != want {
			t.Errorf("KnownDelivers(%q) = %q, want %q", in, got, want)
		}
	}
}
