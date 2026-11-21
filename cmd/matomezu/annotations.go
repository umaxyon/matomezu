package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

type annotationsCmd struct{}

// awaitingItem は、常駐の api/ai/awaiting が返す、AI の応えを待つアノテーション 1 つ（brief は種類の aiBrief の 1 行。無ければ空）
type awaitingItem struct {
	Book       string          `json:"book"`
	Title      string          `json:"title"`
	Annotation json.RawMessage `json:"annotation"`
	Brief      string          `json:"brief"`
}

// writeAwaiting は、待つアノテーションを、ブックごとの見出しと、その下に 1 件 1 行（ページ・種類の id・アノテーションの id・1 行）で書く。
// 中身の全文は書かない（AI が read_page で読む）。待つ物が無ければ何も書かない
func writeAwaiting(out io.Writer, awaiting []awaitingItem) {
	if len(awaiting) == 0 {
		return
	}
	fmt.Fprintf(out, "matomezu: %d annotation(s), such as the user's notes and marks, wait for your answer. "+
		"Answer each as its kind says (see actions), with on.page set to the page of its line. A line is only what tells them apart: read_page shows what it stands on and the whole text of one that ends with … and its length.\n", len(awaiting))
	last := ""
	for _, a := range awaiting {
		if a.Book != last {
			fmt.Fprintf(out, "- book %q (%s)\n", a.Title, a.Book)
			last = a.Book
		}
		var head struct {
			ID         string  `json:"id"`
			Annotation string  `json:"annotation"`
			Page       *string `json:"page"`
		}
		_ = json.Unmarshal(a.Annotation, &head)
		page := "no page"
		if head.Page != nil {
			page = "page " + *head.Page
		}
		line := fmt.Sprintf("  - %s, %s %s", page, head.Annotation, head.ID)
		if a.Brief != "" {
			line += fmt.Sprintf(": %q", a.Brief)
		}
		fmt.Fprintln(out, line)
	}
}

// Run は、AI の応えを待つアノテーションと、見られる前に利用者が戻した AI の変更を、AI に読ませる短い文で書き出す（AI のフックが、ターンの始まりに添える）。
// 常駐を立てず、立っていない・答えない・待つ物が無いときは何も書かない（AI のターンを止めない）
func (c *annotationsCmd) Run() error {
	writeAnnotations(os.Stdout)
	return nil
}

// writeAnnotations は、AI の応えを待つアノテーションと、AI に知らせる事（利用者が見る前に戻した変更など）を out に書く。常駐が立っていなければ何も書かない
func writeAnnotations(out io.Writer) {
	h, err := openHome()
	if err != nil {
		return
	}
	s, err := running(h)
	if err != nil || s == nil {
		return
	}
	body, _, _, err := send(s, http.MethodGet, "api/ai/awaiting", nil, nil)
	if err != nil {
		return
	}
	var got struct {
		Awaiting []awaitingItem `json:"awaiting"`
		Undone   []struct {
			Entry string          `json:"entry"`
			Title string          `json:"title"`
			At    string          `json:"at"`
			Lost  json.RawMessage `json:"lost"`
		} `json:"undone"`
		Failed []struct {
			Book    string   `json:"book"`
			Title   string   `json:"title"`
			Key     string   `json:"key"`
			Changed []string `json:"changed"`
		} `json:"failed"`
		Removed []removedTicket `json:"removed"`
	}
	if json.Unmarshal(body, &got) != nil {
		return
	}
	writeAwaiting(out, got.Awaiting)
	if len(got.Undone) > 0 {
		fmt.Fprintf(out, "matomezu: %d change(s) you made were undone by the user before they saw them. "+
			"Do not redo them on your own; ask the user if they are still needed. Each line is a book, or a page or binder outside any book, and when you changed it; lost is what was put back and the values you had written "+
			"(in lost, entry is the id of the page, book or binder, and at is the place inside it).\n", len(got.Undone))
		for _, u := range got.Undone {
			fmt.Fprintf(out, "- %q (%s), changed at %s: lost %s\n", u.Title, u.Entry, u.At, u.Lost)
		}
	}
	if len(got.Failed) > 0 {
		fmt.Fprintf(out, "matomezu: %d change(s) you sent for the user to apply could not be applied (what they change was changed or removed after you sent them, "+
			"or one of the changes was refused), so nothing was changed. Read the book again and think again (change it yourself, or send a new proposal). changed is what was changed or removed.\n", len(got.Failed))
		for _, f := range got.Failed {
			fmt.Fprintf(out, "- book %q (%s), %s: changed %v\n", f.Title, f.Book, f.Key, f.Changed)
		}
	}
	writeRemoved(out, got.Removed)
}

// removedTicket は、郵便が消えたと記した AI 編集チケット 1 つ（cause は上限で消えた limit か、利用者が消した user）
type removedTicket struct {
	Book  string `json:"book"`
	Title string `json:"title"`
	Key   string `json:"key"`
	Cause string `json:"cause"`
}

// writeRemoved は、反映される前に消えた変更提案を、消えたわけごとに AI 向けの文にして w に書く（無ければ何も書かない）
func writeRemoved(w io.Writer, removed []removedTicket) {
	for _, c := range []struct{ cause, text string }{
		{"limit", "were removed by the mailbox limit before the user applied them, so nothing was changed. Send them again if they are still needed."},
		{"user", "were removed by the user without applying them, so nothing was changed. Do not send them again unless the user asks."},
	} {
		var list []removedTicket
		for _, r := range removed {
			if r.Cause == c.cause {
				list = append(list, r)
			}
		}
		if len(list) == 0 {
			continue
		}
		fmt.Fprintf(w, "matomezu: %d change(s) you sent for the user to apply %s\n", len(list), c.text)
		for _, r := range list {
			fmt.Fprintf(w, "- book %q (%s), %s\n", r.Title, r.Book, r.Key)
		}
	}
}
