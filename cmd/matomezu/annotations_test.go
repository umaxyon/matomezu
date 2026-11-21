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
	item := func(entry, title, id, page, brief string) awaitingItem {
		kind := "book"
		if entry == "o1" {
			kind = "page"
		}
		p := "null"
		if page != "" {
			p = `"` + page + `"`
		}
		return awaitingItem{Entry: awaitingEntry{Kind: kind, ID: entry}, Title: title, Brief: brief,
			Annotation: json.RawMessage(`{"id":"` + id + `","annotation":"@matomezu/base:note","anchors":["a"],"props":{"text":"long text"},"page":` + p + `,"awaits":true}`)}
	}
	var out strings.Builder
	writeAwaiting(&out, []awaitingItem{
		item("b1", "T", "c1", "p1", "見て… (60 chars)"),
		item("b1", "T", "c2", "p2", ""),
		item("b2", "U", "c3", "", "x"),
		item("o1", "O", "c4", "o1", ""),
	})
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	want := []string{
		`- book "T" (b1)`,
		`  - page p1, @matomezu/base:note c1: "見て… (60 chars)"`,
		`  - page p2, @matomezu/base:note c2`,
		`- book "U" (b2)`,
		`  - no page, @matomezu/base:note c3: "x"`,
		`- page "O" (o1), not in a book`,
		`  - page o1, @matomezu/base:note c4`,
	}
	if !strings.HasPrefix(lines[0], "matomezu: 4 annotation(s)") || strings.Join(lines[1:], "\n") != strings.Join(want, "\n") {
		t.Fatalf("got\n%s", out.String())
	}
	if strings.Contains(out.String(), "long text") {
		t.Fatalf("the whole text was written: %s", out.String())
	}
}

func TestWriteUndoneNamesTheStageEntryAndTheRows(t *testing.T) {
	var out strings.Builder
	writeUndone(&out, []undoneTicket{
		{Entry: "b1", Title: "Plan", At: "2026-11-21T01:00:00Z", Lost: json.RawMessage(`[{"entry":"p1","at":"title","value":"AI"}]`)},
		{Entry: "p9", Title: "Memo", At: "2026-11-21T01:05:00Z", Lost: json.RawMessage(`[]`)},
	})
	text := out.String()
	for _, want := range []string{
		"2 change(s) you made were undone by the user before they saw them.",
		"in lost, entry is the id of the page, book or binder, and at is the place inside it",
		`- "Plan" (b1) at 2026-11-21T01:00:00Z: [{"entry":"p1","at":"title","value":"AI"}]`,
		`- "Memo" (p9) at 2026-11-21T01:05:00Z: []`,
	} {
		if !strings.Contains(text, want) {
			t.Errorf("missing %q in:\n%s", want, text)
		}
	}
	out.Reset()
	writeUndone(&out, nil)
	if out.Len() != 0 {
		t.Errorf("no undone wrote %q", out.String())
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
