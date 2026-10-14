package main

// LLM の履歴（D31。internal/server/llmhist.go）: matomezu history と matomezu revert

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/daemon"
	"github.com/umaxyon/matomezu/internal/server"
)

// historyDoc は path の図の id（サーバーに登録する）
func historyDoc(path string) (*daemon.State, string, error) {
	s := daemon.Running()
	if s == nil {
		return nil, "", errors.New("no matomezu server is running; the LLM history is kept while the diagram is open in the browser")
	}
	res, err := daemon.Open(s, path, false, "")
	if err != nil {
		return nil, "", err
	}
	return s, res.ID, nil
}

func historyCmd(args []string) error {
	fs := newFlags("history")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() < 1 || fs.NArg() > 2 {
		fs.Usage()
		os.Exit(2)
	}
	s, id, err := historyDoc(fs.Arg(0))
	if err != nil {
		return err
	}
	entries, err := daemon.LLMHistory(s, id)
	if err != nil {
		return err
	}
	if fs.NArg() == 2 {
		n, err := strconv.Atoi(fs.Arg(1))
		if err != nil {
			return fmt.Errorf("n must be a number: %s", fs.Arg(1))
		}
		for _, e := range entries {
			if e.N == n {
				printEntry(e, true)
				return nil
			}
		}
		return fmt.Errorf("no change %d in the LLM history", n)
	}
	if len(entries) == 0 {
		fmt.Println("no changes in the LLM history")
		return nil
	}
	for _, e := range entries {
		printEntry(e, false)
	}
	return nil
}

func revertCmd(args []string) error {
	fs := newFlags("revert")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 2 {
		fs.Usage()
		os.Exit(2)
	}
	n, err := strconv.Atoi(fs.Arg(1))
	if err != nil {
		return fmt.Errorf("n must be a number: %s", fs.Arg(1))
	}
	s, id, err := historyDoc(fs.Arg(0))
	if err != nil {
		return err
	}
	if err := daemon.Revert(s, id, n); err != nil {
		return err
	}
	fmt.Printf("reverted change %d (the revert is recorded as a new change; see: matomezu history %s)\n", n, fs.Arg(0))
	return nil
}

var kindNames = map[string]string{"node": "box", "edge": "edge", "page": "page", "removed": "removed box", "world": "world", "top": "file", "order": "order of boxes"}

func printEntry(e server.LLMEntry, detail bool) {
	marks := []string{}
	if e.Note != "" {
		marks = append(marks, e.Note)
	}
	if e.Seen {
		marks = append(marks, "seen")
	}
	for _, o := range e.Overwritten {
		marks = append(marks, "overwritten by the user before seen: "+strings.Join(o.Items, ", "))
	}
	head := fmt.Sprintf("#%d %s  %d change(s)", e.N, time.UnixMilli(e.At).Format("2006-01-02 15:04:05"), len(e.Changes))
	if len(marks) > 0 {
		head += "  [" + strings.Join(marks, "; ") + "]"
	}
	fmt.Println(head)
	for _, c := range e.Changes {
		name := kindNames[c.Kind]
		target := strings.TrimSpace(name + " " + c.Key)
		switch c.Op {
		case "add":
			fmt.Printf("  + %s%s\n", target, captionOf(c.From))
			if detail {
				fmt.Printf("      %s\n", compact(c.From))
			}
		case "remove":
			fmt.Printf("  - %s%s\n", target, captionOf(c.From))
			if detail {
				fmt.Printf("      %s\n", compact(c.From))
			}
		case "order":
			fmt.Printf("  ~ %s\n", name)
			if detail {
				fmt.Printf("      %s -> %s\n", compact(c.From), compact(c.To))
			}
		default:
			fmt.Printf("  ~ %s: %s\n", target, strings.Join(c.Fields, ", "))
			if detail {
				fields := append([]string(nil), c.Fields...)
				sort.Strings(fields)
				for _, f := range fields {
					fmt.Printf("      %s: %s -> %s\n", f, valueOf(c.Before, f), valueOf(c.After, f))
				}
			}
		}
	}
}

func captionOf(raw json.RawMessage) string {
	var o struct {
		Caption string `json:"caption"`
	}
	if json.Unmarshal(raw, &o) == nil && o.Caption != "" {
		return fmt.Sprintf(" %q", o.Caption)
	}
	return ""
}

func valueOf(m map[string]json.RawMessage, f string) string {
	v, ok := m[f]
	if !ok {
		return "(none)"
	}
	return compact(v)
}

func compact(raw json.RawMessage) string {
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return string(raw)
	}
	b, _ := json.Marshal(v)
	return string(b)
}
