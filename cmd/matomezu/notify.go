package main

// 通知（D30。internal/server/notify.go）: matomezu notify

import (
	"errors"
	"fmt"
	"os"

	"github.com/umaxyon/matomezu/internal/daemon"
	"github.com/umaxyon/matomezu/internal/server"
)

func notifyCmd(args []string) error {
	fs := newFlags("notify")
	title := fs.String("title", "", "the title of the notice (required)")
	body := fs.String("body", "", "the text of the notice, e.g. what changed")
	page := fs.String("page", "", "with a file, offer to open the page with this id instead of the first page")
	mail := fs.Bool("mail", false, "only put it in the mailbox (no dialog)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *title == "" || fs.NArg() > 1 {
		fs.Usage()
		os.Exit(2)
	}
	s := daemon.Running()
	if s == nil {
		return errors.New("not open in a browser; run: matomezu open <file>")
	}
	n := server.NotifyRequest{Title: *title, Body: *body, Page: *page, Mail: *mail}
	if fs.NArg() == 1 {
		n.Path = fs.Arg(0)
	}
	if err := daemon.Notify(s, n); err != nil {
		return err
	}
	fmt.Println("notified")
	return nil
}
