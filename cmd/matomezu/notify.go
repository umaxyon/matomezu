package main

// 通知（D30。internal/server/notify.go）: matomezu notify

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

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
	say := fs.String("say", "", "a short message in a bubble beside the frame (20 full-width characters at most)")
	button := fs.String("button", "", "a button in the bubble, e.g. OK; the user's press is read with matomezu ask -status, and you end it with matomezu ask -end")
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
	a, err := daemon.Point(s, server.PointRequest{Path: fs.Arg(0), Box: fs.Arg(1), Clear: *clear, Say: *say, Button: *button})
	if err != nil {
		return err
	}
	switch a.State {
	case "asked":
		fmt.Println("the box is in another diagram: asked the user whether to move there (run check on that file later to see the answer)")
	case "cleared":
		fmt.Println("cleared")
	default:
		if *button != "" {
			fmt.Println("shown; read the press with matomezu ask -status, then end it with matomezu ask -end before anything else")
		} else {
			fmt.Println("shown; do not focus again until the user responds (check shows whether they have)")
		}
	}
	return nil
}

// AI の問い（D36。internal/server/ask.go）: matomezu ask
func askCmd(args []string) error {
	fs := newFlags("ask")
	status := fs.Bool("status", false, "print the open topic: each question's state and answer")
	end := fs.Bool("end", false, "end the open topic (its bubbles disappear); also to withdraw it before asking again")
	hide := fs.String("hide", "", "fold the bubble of this question into a small mark")
	show := fs.String("show", "", "open the bubble of this question again")
	news := fs.Bool("new", false, "print the topic only if the user answered or ended it since you last read it; otherwise print nothing (for a hook on every message)")
	wait := fs.Bool("wait", false, "wait until every question is responded or the topic ends (10 minutes at most); run it in the background")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *news {
		// フックで会話のたびに動くので、サーバーが無い・誤りでも何も出さない
		if s := daemon.Running(); s != nil {
			if t, err := daemon.AskNew(s); err == nil && t != nil {
				fmt.Println("matomezu: the user responded to your questions")
				printTopic(t)
			}
		}
		return nil
	}
	control := *status || *end || *hide != "" || *show != "" || *wait
	if (control && fs.NArg() != 0) || (!control && fs.NArg() != 2) {
		fs.Usage()
		os.Exit(2)
	}
	s := daemon.Running()
	if s == nil {
		return errors.New("not open in a browser; run: matomezu open <file>")
	}
	if *wait {
		return askWait(s)
	}
	if control {
		var c *server.AskControl
		if !*status {
			c = &server.AskControl{End: *end, Hide: *hide, Show: *show}
		}
		t, err := daemon.AskTopic(s, c)
		if err != nil {
			return err
		}
		if t == nil {
			fmt.Println("no topic of questions is open")
			return nil
		}
		printTopic(t)
		if *end {
			fmt.Println("ended")
		}
		return nil
	}
	var spec struct {
		Items []server.AskItem `json:"items"`
	}
	dec := json.NewDecoder(strings.NewReader(fs.Arg(1)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&spec); err != nil {
		return fmt.Errorf("the questions must be JSON like {\"items\":[{\"box\":\"5\",\"text\":\"OK?\",\"choices\":[\"yes\",\"no\"]}]}: %v", err)
	}
	state, t, err := daemon.Question(s, fs.Arg(0), spec.Items)
	if err != nil {
		return err
	}
	if state == "asked" {
		fmt.Println("the boxes are in another diagram: asked the user whether to move there (matomezu ask -status shows the answer)")
	} else {
		fmt.Println("shown; read the answers with matomezu ask -status, and end the topic with matomezu ask -end before asking anything else")
	}
	printTopic(t)
	return nil
}

// askWaitFor は ask -wait が待つ長さ（2026-10-16 ユーザー）
const askWaitFor = 10 * time.Minute

// askWait は話題が片付くまで待ち、片付き方と話題の様子を出す
func askWait(s *daemon.State) error {
	res, err := daemon.AskWait(s, askWaitFor)
	if err != nil {
		if daemon.Running() == nil {
			return errors.New("the server stopped; the topic of questions is gone")
		}
		return err
	}
	switch res.Reason {
	case "none":
		fmt.Println("no topic of questions is open")
		return nil
	case "withdrawn":
		fmt.Println("the topic was ended (matomezu ask -end)")
		return nil
	case "timeout":
		fmt.Printf("still waiting after %d minutes: the topic is open. wait again (matomezu ask -wait) or end it (matomezu ask -end)\n", int(askWaitFor/time.Minute))
	case "answered":
		fmt.Println("every question is responded")
	case "declined", "closed":
		fmt.Println("the questions could not be shown; end the topic: matomezu ask -end")
	}
	printTopic(res.Topic)
	if res.Reason == "answered" || res.Reason == "ended" {
		fmt.Println("the user may be looking at the browser, not at you: tell them on the screen that you read the answers (matomezu notify -title ...)")
	}
	return nil
}

// printTopic は話題の様子を 1 問 1 行で出す
func printTopic(t *server.Topic) {
	if t == nil {
		return
	}
	state := map[string]string{"asking": "waiting for the user to move to the diagram", "open": "open", "declined": "the user declined to move to the diagram", "closed": "the user closed the diagram", "ended": "the user ended the topic (you can ask again)"}[t.State]
	fmt.Printf("topic on %s: %s\n", t.Path, state)
	for _, it := range t.Items {
		name := it.ID
		if it.Letter != "" {
			name += " (" + it.Letter + ")"
		}
		line := fmt.Sprintf("  %s box %s, %s: %s", name, it.Box, it.View, it.State)
		if len(it.Answer) > 0 {
			b, _ := json.Marshal(it.Answer)
			line += " " + string(b)
		}
		if it.Note != "" {
			b, _ := json.Marshal(it.Note)
			line += " note " + string(b)
		}
		fmt.Println(line)
	}
}
