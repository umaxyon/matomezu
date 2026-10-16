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

// フォーカス枠（D37。internal/server/point.go）: matomezu focus
func focusCmd(args []string) error {
	fs := newFlags("focus")
	clear := fs.Bool("clear", false, "remove the focus you are showing")
	mail := fs.Bool("mail", false, "only put it in the mailbox; the user opens it when they like (allowed while a focus is waiting)")
	title := fs.String("title", "", "with -mail, the title of the notice")
	body := fs.String("body", "", "with -mail, the text of the notice, e.g. why you point at the box")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if !(*clear && fs.NArg() == 0 && !*mail) && !(!*clear && fs.NArg() == 2) {
		fs.Usage()
		os.Exit(2)
	}
	s := daemon.Running()
	if s == nil {
		return errors.New("not open in a browser; run: matomezu open <file>")
	}
	if *mail {
		n := server.NotifyRequest{Title: *title, Body: *body, Path: fs.Arg(0), Box: fs.Arg(1), Mail: true}
		if err := daemon.Notify(s, n); err != nil {
			return err
		}
		fmt.Println("put in the mailbox; the box is shown when the user opens it")
		return nil
	}
	a, err := daemon.Point(s, fs.Arg(0), fs.Arg(1), *clear)
	if err != nil {
		return err
	}
	switch a.State {
	case "asked":
		fmt.Println("the box is in another diagram: asked the user whether to move there (run check on that file later to see the answer)")
	case "cleared":
		fmt.Println("cleared")
	default:
		fmt.Println("shown; do not focus again until the user responds (check shows whether they have)")
	}
	return nil
}
