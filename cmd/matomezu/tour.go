package main

// matomezu tour（説明ツアー。D38。internal/server/tour.go・docs/TOUR-plan.md）

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

// tourWaitFor は tour -wait が待つ長さ（ask -wait と同じ）
const tourWaitFor = 10 * time.Minute

func tourCmd(args []string) error {
	fs := newFlags("tour")
	title := fs.String("title", "", "what the tour explains (shown as: may I start the tour of <title>?)")
	mail := fs.Bool("mail", false, "only put the offer in the mailbox (no dialog)")
	status := fs.Bool("status", false, "print the tour: waiting / running / complete / interrupt")
	end := fs.Bool("end", false, "withdraw the tour (it stops on the screen)")
	wait := fs.Bool("wait", false, "wait until the tour is complete or interrupted (10 minutes at most); run it in the background")
	news := fs.Bool("new", false, "print the result only if the tour ended since you last read it; otherwise print nothing (for a hook on every message)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *news {
		if s := daemon.Running(); s != nil {
			if t, err := daemon.TourState(s, "new=1"); err == nil && t != nil {
				fmt.Println("matomezu: tour " + tourResult(t))
			}
		}
		return nil
	}
	control := *status || *end || *wait
	if (control && fs.NArg() != 0) || (!control && fs.NArg() != 2) {
		fs.Usage()
		os.Exit(2)
	}
	s := daemon.Running()
	if s == nil {
		return errors.New("not open in a browser; run: matomezu open <file>")
	}
	switch {
	case *status:
		t, err := daemon.TourState(s, "status=1")
		if err != nil {
			return err
		}
		if t == nil {
			fmt.Println("no tour")
			return nil
		}
		fmt.Println("tour " + tourResult(t))
		return nil
	case *end:
		ended, err := daemon.TourEnd(s)
		if err != nil {
			return err
		}
		if ended {
			fmt.Println("withdrawn")
		} else {
			fmt.Println("no tour is waiting or running")
		}
		return nil
	case *wait:
		res, err := daemon.TourWait(s, tourWaitFor)
		if err != nil {
			if daemon.Running() == nil {
				return errors.New("the server stopped; the tour is gone")
			}
			return err
		}
		switch res.Reason {
		case "none":
			fmt.Println("no tour")
		case "withdrawn":
			fmt.Println("the tour was withdrawn (matomezu tour -end)")
		case "timeout":
			fmt.Printf("still waiting after %d minutes: tour %s. wait again (matomezu tour -wait) or withdraw it (matomezu tour -end)\n", int(tourWaitFor/time.Minute), tourResult(res.Tour))
		default:
			fmt.Println("tour " + tourResult(res.Tour))
			fmt.Println("the user may be looking at the browser, not at you: tell them on the screen that you got the result (matomezu notify -title ...)")
		}
		return nil
	}
	var spec struct {
		Steps []server.TourStep `json:"steps"`
	}
	dec := json.NewDecoder(strings.NewReader(fs.Arg(1)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&spec); err != nil {
		return fmt.Errorf(`the steps must be JSON like {"steps":[{"box":"5","say":"the entrance"},{"box":"8","say":"it splits here","path":"other.json"}]}: %v`, err)
	}
	if _, err := daemon.Tour(s, fs.Arg(0), *title, spec.Steps, *mail); err != nil {
		return err
	}
	fmt.Println("offered: the user is asked whether to start it (start / decline / later from the mailbox). matomezu tour -status (or -wait in the background) tells complete or interrupt")
	return nil
}

// tourResult はツアーの様子を AI 向けの言葉にする（どの段まで見たかは出さない。2026-10-16 ユーザー）
func tourResult(t *server.Tour) string {
	switch t.State {
	case "waiting":
		return fmt.Sprintf("%q: waiting for the user to start it", t.Title)
	case "running":
		return fmt.Sprintf("%q: running (the user is taking it now)", t.Title)
	case "complete":
		return fmt.Sprintf("%q: complete (the user saw every step)", t.Title)
	}
	return fmt.Sprintf("%q: interrupt (the user declined or stopped it; treat it as not understood)", t.Title)
}
