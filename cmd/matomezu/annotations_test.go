package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestWriteAwaiting(t *testing.T) {
	var none strings.Builder
	writeAwaiting(&none, nil)
	if none.Len() != 0 {
		t.Fatalf("no awaiting wrote %q", none.String())
	}
	item := func(book, title, id, page, brief string) awaitingItem {
		p := "null"
		if page != "" {
			p = `"` + page + `"`
		}
		return awaitingItem{Book: book, Title: title, Brief: brief,
			Annotation: json.RawMessage(`{"id":"` + id + `","annotation":"@matomezu/base:note","anchors":["a"],"props":{"text":"long text"},"page":` + p + `,"awaits":true}`)}
	}
	var out strings.Builder
	writeAwaiting(&out, []awaitingItem{
		item("b1", "T", "c1", "p1", "見て… (60 chars)"),
		item("b1", "T", "c2", "p2", ""),
		item("b2", "U", "c3", "", "x"),
	})
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	want := []string{
		`- book "T" (b1)`,
		`  - page p1, @matomezu/base:note c1: "見て… (60 chars)"`,
		`  - page p2, @matomezu/base:note c2`,
		`- book "U" (b2)`,
		`  - no page, @matomezu/base:note c3: "x"`,
	}
	if !strings.HasPrefix(lines[0], "matomezu: 3 annotation(s)") || strings.Join(lines[1:], "\n") != strings.Join(want, "\n") {
		t.Fatalf("got\n%s", out.String())
	}
	if strings.Contains(out.String(), "long text") {
		t.Fatalf("the whole text was written: %s", out.String())
	}
}

func TestWriteRemovedSeparatesTheCauses(t *testing.T) {
	var out strings.Builder
	writeRemoved(&out, []removedTicket{
		{Book: "b1", Title: "Plan", Key: "m1", Cause: "limit"},
		{Book: "b1", Title: "Plan", Key: "m2", Cause: "user"},
		{Book: "b2", Title: "Other", Key: "m3", Cause: "other"},
	})
	text := out.String()
	for _, want := range []string{
		"1 change(s) you sent for the user to apply were removed by the mailbox limit",
		"Send them again if they are still needed.",
		"1 change(s) you sent for the user to apply were removed by the user without applying them",
		"Do not send them again unless the user asks.",
		`- book "Plan" (b1), m1`,
		`- book "Plan" (b1), m2`,
	} {
		if !strings.Contains(text, want) {
			t.Errorf("missing %q in:\n%s", want, text)
		}
	}
	if strings.Contains(text, "m3") {
		t.Errorf("an unknown cause must be skipped:\n%s", text)
	}
	out.Reset()
	writeRemoved(&out, nil)
	if out.Len() != 0 {
		t.Errorf("nothing to say, but wrote %q", out.String())
	}
}

// --session-ends-with が指すプロセス: program は AI のプログラム、mcp は自分（親が入口なら入口）、空は名乗らない
