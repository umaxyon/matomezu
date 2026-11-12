package main

// AI を起こす知らせ（watch）: 常駐の GET /api/ai/watch につなぎ、利用者が画面で行った事のうち AI を起こす物（参加の要求が受け入れられた・断られたなど）の 1 行ずつを標準出力に書く。
// AI の側で裏に走らせ、書いた 1 行で AI のターンを始める物（Claude Code のプラグインの monitor。clients/claude-code）が動かす。
// --host の AI のプログラムのプロセス id から join した参加者への知らせだけが届く

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/home"
)

// watchRetry は、常駐が立っていない・切れたときに、つなぎ直すまで待つ間
const watchRetry = 3 * time.Second

// Run は、常駐の AI を起こす知らせ（GET /api/ai/watch）につなぎ、届いた 1 行ずつを標準出力に書く。常駐が立っていなければ待ち、切れたらつなぎ直す（常駐は立てない）。
// --host のプロセスが居なくなったら終える（AI のプログラムが閉じたのに残らないように）
func (c *watchCmd) Run() error {
	for processAlive(c.Host) {
		if s := runningServer(); s != nil {
			_ = watchOnce(s, c.Host, c.Session, os.Stdout)
		}
		time.Sleep(watchRetry)
	}
	return nil
}

// runningServer は、立っていて答える常駐のつなぎ方（無ければ nil）
func runningServer() *home.Server {
	h, err := openHome()
	if err != nil {
		return nil
	}
	s, err := running(h)
	if err != nil {
		return nil
	}
	return s
}

// watchOnce は、常駐 s の起こす知らせにつなぎ、切れるまで、届いた知らせの文を 1 行ずつ out に書く
func watchOnce(s *home.Server, host, session string, out io.Writer) error {
	res, err := request(s, http.MethodGet, "api/ai/watch?host="+url.QueryEscape(host)+"&session="+url.QueryEscape(session), nil, 0, nil)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("watch: %s", res.Status)
	}
	return readWakes(res.Body, out, func() bool { return processAlive(host) })
}

// readWakes は、SSE の流れ r の wake の知らせの文を、1 行ずつ out に書く（ほかの知らせは読み捨てる）。行を読むたびに still を聞き、偽なら終える（keep が間を置いて届く）
func readWakes(r io.Reader, out io.Writer, still func() bool) error {
	scan := bufio.NewScanner(r)
	name := ""
	for scan.Scan() && still() {
		line := scan.Text()
		switch {
		case strings.HasPrefix(line, "event: "):
			name = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: ") && name == "wake":
			var wake struct {
				Text string `json:"text"`
			}
			if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &wake) == nil && wake.Text != "" {
				fmt.Fprintln(out, wake.Text)
			}
		case line == "":
			name = ""
		}
	}
	return scan.Err()
}
