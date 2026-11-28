package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/umaxyon/matomezu/internal/aiwire"
	"github.com/umaxyon/matomezu/internal/home"
	"github.com/umaxyon/matomezu/internal/mcp"
)

// httpAPI は、合言葉を付けて常駐の AI の入口を呼ぶ。
// 常駐を立て直すと合言葉もアドレスの先も変わるので、401 か、つなげなかった（送る前に断られた）ときは、
// reconnect でつなぎ方を取り直して（止まっていれば立て直して）1 度だけやり直す
type httpAPI struct {
	mu        sync.Mutex
	s         *home.Server
	reconnect func() (*home.Server, error)
	toldOther bool // 常駐の版がこの MCP と違うと、AI にもう知らせたか
	// titled は、常駐が見出しで返した作業名を、変わったら書く物（nil なら書かない。newTitleWriter）
	titled *titleWriter
}

// titleWriter は、常駐が返した作業名を、変わったときだけ、ADE のワークスペースの表示名に書く（書くのは遅いので、1 つの goroutine で、最後に受けた名前だけを順に書く）
type titleWriter struct {
	mu     sync.Mutex
	last   string
	wanted chan string
}

// newTitleWriter は、作業名 name を write で書く titleWriter（write は ADE の事情を抱える関数。renameAdeWorkspace）
func newTitleWriter(write func(name string)) *titleWriter {
	t := &titleWriter{wanted: make(chan string, 1)}
	go func() {
		for name := range t.wanted {
			write(name)
		}
	}()
	return t
}

// saw は、常駐の答えの見出し reply に作業名があり、前に受けた物と違えば、書くよう頼む（前の頼みがまだ書かれていなければ置き換える）
func (t *titleWriter) saw(reply http.Header) {
	if t == nil {
		return
	}
	name, err := url.QueryUnescape(reply.Get(aiwire.WorkTitleHeader))
	if err != nil || name == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if name == t.last {
		return
	}
	t.last = name
	select {
	case <-t.wanted:
	default:
	}
	t.wanted <- name
}

func (a *httpAPI) Get(path string, header http.Header) (json.RawMessage, http.Header, error) {
	return a.do(http.MethodGet, path, nil, header)
}

func (a *httpAPI) Post(path string, body any, header http.Header) (json.RawMessage, http.Header, error) {
	if raw, ok := body.(mcp.Bytes); ok {
		h := header.Clone()
		if h == nil {
			h = http.Header{}
		}
		h.Set("Content-Type", "application/octet-stream")
		return a.do(http.MethodPost, path, raw, h)
	}
	b, err := json.Marshal(body)
	if err != nil {
		return nil, nil, err
	}
	return a.do(http.MethodPost, path, b, header)
}

func (a *httpAPI) do(method, path string, body []byte, header http.Header) (json.RawMessage, http.Header, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	out, reply, stale, err := send(a.s, method, path, body, header)
	if stale {
		s, rerr := a.reconnect()
		if rerr != nil {
			return nil, nil, errors.Join(err, rerr)
		}
		a.s = s
		out, reply, _, err = send(a.s, method, path, body, header)
	}
	if err == nil {
		a.titled.saw(reply)
	}
	if err == nil && !a.toldOther {
		if note := otherVersionNote(a.s.Version); note != "" {
			a.toldOther = true
			reply = withNotice(reply, note)
		}
	}
	return out, reply, err
}

// otherVersionNote は、常駐の版 running がこの matomezu と違うときに AI に 1 度だけ添える文（開発の版どうしは比べない）
func otherVersionNote(running string) string {
	if running == version || running == "" || running == devVersion || version == devVersion {
		return ""
	}
	return fmt.Sprintf("matomezu: the matomezu server is version %s, but the matomezu of this conversation is %s. Tell the user that restarting this conversation uses the new version.", running, version)
}

// withNotice は、常駐が返した知らせ（あれば）の後ろに text を足した返事の見出し
func withNotice(h http.Header, text string) http.Header {
	out := h.Clone()
	if out == nil {
		out = http.Header{}
	}
	if v := out.Get(aiwire.NoticeHeader); v != "" {
		if was, err := url.QueryUnescape(v); err == nil {
			text = was + "\n" + text
		}
	}
	out.Set(aiwire.NoticeHeader, url.QueryEscape(text))
	return out
}

// send は 1 度だけ呼ぶ。stale は、つなぎ方が古いかもしれない（401 か、つなげなかった）とき。
// 送ったあとに答えが来なかったときは、常駐がもう行ったかもしれないので stale にしない
func send(s *home.Server, method, path string, body []byte, header http.Header) (out json.RawMessage, reply http.Header, stale bool, err error) {
	res, err := request(s, method, path, body, 60*time.Second, header)
	if err != nil {
		var op *net.OpError
		return nil, nil, errors.As(err, &op) && op.Op == "dial", fmt.Errorf("the matomezu server did not answer: %w", err)
	}
	defer res.Body.Close()
	out, err = io.ReadAll(res.Body)
	if err != nil {
		return nil, nil, false, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, nil, res.StatusCode == http.StatusUnauthorized, &mcp.HostError{Method: method, Path: path, Status: res.Status, Code: res.StatusCode, Text: string(bytes.TrimSpace(out))}
	}
	return out, res.Header, false, nil
}

// call は合言葉を付けて常駐の API を本文なしで呼ぶ（答えは 3 秒だけ待つ）
func call(s *home.Server, method, path string) (*http.Response, error) {
	res, err := request(s, method, path, nil, 3*time.Second, nil)
	if err != nil {
		return nil, err
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s %s: %s", method, path, res.Status)
	}
	return res, nil
}

// request は合言葉を付けて常駐の API を 1 度呼ぶ（body があれば JSON で送る。答えは timeout だけ待つ）
func request(s *home.Server, method, path string, body []byte, timeout time.Duration, header http.Header) (*http.Response, error) {
	req, err := http.NewRequest(method, s.URL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	for k, v := range header {
		req.Header[k] = v
	}
	req.Header.Set("Authorization", "Bearer "+s.Token)
	if body != nil && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}
	return (&http.Client{Timeout: timeout}).Do(req)
}
