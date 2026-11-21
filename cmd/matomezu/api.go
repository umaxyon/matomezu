package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"time"

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
}

func (a *httpAPI) Get(path string, header http.Header) (json.RawMessage, http.Header, error) {
	return a.do(http.MethodGet, path, nil, header)
}

func (a *httpAPI) Post(path string, body any, header http.Header) (json.RawMessage, http.Header, error) {
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
	if !stale {
		return out, reply, err
	}
	s, rerr := a.reconnect()
	if rerr != nil {
		return nil, nil, errors.Join(err, rerr)
	}
	a.s = s
	out, reply, _, err = send(a.s, method, path, body, header)
	return out, reply, err
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
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return (&http.Client{Timeout: timeout}).Do(req)
}
