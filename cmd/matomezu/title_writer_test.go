package main

import (
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// 常駐が返した作業名は、変わったときだけ書く（同じ名前・名前の無い答えでは書かない）
func TestTitleWriterWritesOnlyChangedNames(t *testing.T) {
	wrote := make(chan string, 8)
	w := newTitleWriter(func(name string) { wrote <- name })
	reply := func(name string) http.Header {
		h := http.Header{}
		if name != "" {
			h.Set(aiwire.WorkTitleHeader, url.QueryEscape(name))
		}
		return h
	}
	for _, name := range []string{"ひよこ T-1", "ひよこ T-1", "", "ひよこ T-2"} {
		w.saw(reply(name))
		time.Sleep(20 * time.Millisecond)
	}
	close(w.wanted)
	var got []string
	for len(got) < 2 {
		select {
		case n := <-wrote:
			got = append(got, n)
		case <-time.After(time.Second):
			t.Fatalf("written = %q", got)
		}
	}
	if got[0] != "ひよこ T-1" || got[1] != "ひよこ T-2" || len(wrote) != 0 {
		t.Fatalf("written = %q (and %d more)", got, len(wrote))
	}
	var none *titleWriter
	none.saw(reply("x"))
}
