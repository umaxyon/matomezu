package main

// LLM が図の配置を調整するためのコマンド。
//
//	matomezu check [-page id] <file.json>             開いている画面が配置した結果の要約を出す
//	matomezu set [-page id] <file.json> <id.key=value>...  ボックス（world は図全体）の項目だけを書き換え、要約を出す
//
// -page があれば、その箱のページ（page: true の箱の中身）の要約を出す。無ければ最初のページ。
//
// JSON 全体を読み書きせずに済むよう、書き換えは項目単位、結果は問題のあるところだけの短い要約にしている。

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	neturl "net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/umaxyon/matomezu/internal/daemon"
	"github.com/umaxyon/matomezu/internal/server"
)

// 画面が新しい版を配置し終えるのを待つ時間
const layoutWait = 10 * time.Second

func check(args []string) error {
	fs := newFlags("check")
	page := fs.String("page", "", "summarize the page of this box instead of the first page")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		os.Exit(2)
	}
	summary, err := waitLayout(fs.Arg(0), *page)
	if err != nil {
		return err
	}
	fmt.Println(summary)
	return nil
}

func set(args []string) error {
	fs := newFlags("set")
	page := fs.String("page", "", "summarize the page of this box instead of the first page")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() < 2 {
		fs.Usage()
		os.Exit(2)
	}
	path := fs.Arg(0)
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	out, err := applySets(b, fs.Args()[1:])
	if err != nil {
		return err
	}
	if err := writeFile(path, out); err != nil {
		return err
	}
	summary, err := waitLayout(path, *page)
	if err != nil {
		return fmt.Errorf("written, but %w", err)
	}
	fmt.Println(summary)
	return nil
}

// waitLayout は、開いている画面が今のファイルの版の page（"" は最初のページ）を配置した結果を待って返す
func waitLayout(path, page string) (string, error) {
	s := daemon.Running()
	if s == nil {
		return "", errors.New("not open in a browser; run: matomezu open " + path)
	}
	// open の直後は、ブラウザがつながるまで少しかかる
	deadline := time.Now().Add(layoutWait)
	var res server.OpenResult
	for {
		var err error
		// 見ていないタブには配置の結果が無いので、その図のタブを前に出して配置させる
		if res, err = daemon.Open(s, path, true, page); err != nil {
			return "", err
		}
		if res.Connections > 0 {
			break
		}
		if time.Now().After(deadline) {
			return "", errors.New("not open in a browser; run: matomezu open " + path)
		}
		time.Sleep(200 * time.Millisecond)
	}
	url := s.URL("/d/" + res.ID + "/api/layout?page=" + neturl.QueryEscape(page))
	for {
		var l struct {
			server.Layout
			Current string `json:"current"`
		}
		if err := getJSON(url, &l); err != nil {
			return "", err
		}
		if l.Version != "" && l.Version == l.Current {
			return l.Summary, nil
		}
		if time.Now().After(deadline) {
			if l.Version == "" {
				// 入れ替わったサーバーに、前の版の画面がつながったままになっている
				return "", errors.New("the open page has not reported its layout; ask the user to reload the page")
			}
			return "", errors.New("the browser did not lay out the current file (is it valid JSON for matomezu? check the browser)")
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func getJSON(url string, out any) error {
	c := &http.Client{Timeout: 3 * time.Second}
	res, err := c.Get(url)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: %s", url, res.Status)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// ---- 項目の書き換え ----

// object は JSON のオブジェクトを、項目の並びを保ったまま扱う
type object struct {
	keys []string
	vals map[string]json.RawMessage
}

func parseObject(b []byte) (*object, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	if t, err := dec.Token(); err != nil || t != json.Delim('{') {
		return nil, errors.New("not a JSON object")
	}
	o := &object{vals: map[string]json.RawMessage{}}
	for dec.More() {
		t, err := dec.Token()
		if err != nil {
			return nil, err
		}
		k := t.(string)
		var v json.RawMessage
		if err := dec.Decode(&v); err != nil {
			return nil, err
		}
		if _, ok := o.vals[k]; !ok {
			o.keys = append(o.keys, k)
		}
		o.vals[k] = v
	}
	return o, nil
}

func (o *object) set(k string, v json.RawMessage) {
	if _, ok := o.vals[k]; !ok {
		o.keys = append(o.keys, k)
	}
	o.vals[k] = v
}

func (o *object) del(k string) {
	if _, ok := o.vals[k]; !ok {
		return
	}
	delete(o.vals, k)
	for i, x := range o.keys {
		if x == k {
			o.keys = append(o.keys[:i], o.keys[i+1:]...)
			break
		}
	}
}

func (o *object) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range o.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		kb, _ := json.Marshal(k)
		buf.Write(kb)
		buf.WriteByte(':')
		buf.Write(o.vals[k])
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// value は値の文字列を JSON にする。空なら nil（項目を消す）
func value(s string) json.RawMessage {
	switch {
	case s == "":
		return nil
	case s == "true" || s == "false":
		return json.RawMessage(s)
	}
	if _, err := strconv.ParseFloat(s, 64); err == nil {
		return json.RawMessage(s)
	}
	b, _ := json.Marshal(s)
	return b
}

// applySets は "id.key=value" の並びを図に当てる。id が world なら図全体。value が空なら項目を消す
func applySets(b []byte, sets []string) ([]byte, error) {
	doc, err := parseObject(b)
	if err != nil {
		return nil, err
	}
	var rawNodes []json.RawMessage
	if err := json.Unmarshal(doc.vals["nodes"], &rawNodes); err != nil {
		return nil, errors.New("nodes array not found")
	}
	nodes := make([]*object, len(rawNodes))
	index := map[string]int{}
	for i, r := range rawNodes {
		if nodes[i], err = parseObject(r); err != nil {
			return nil, fmt.Errorf("node %d: %w", i, err)
		}
		index[strings.Trim(string(nodes[i].vals["id"]), `"`)] = i
	}
	var world *object
	for _, a := range sets {
		target, rest, ok1 := strings.Cut(a, ".")
		key, val, ok2 := strings.Cut(rest, "=")
		if !ok1 || !ok2 || key == "" {
			return nil, fmt.Errorf("expected id.key=value: %s", a)
		}
		var o *object
		if target == "world" {
			if world == nil {
				if w, ok := doc.vals["world"]; ok {
					if world, err = parseObject(w); err != nil {
						return nil, fmt.Errorf("world: %w", err)
					}
				} else {
					world = &object{vals: map[string]json.RawMessage{}}
				}
			}
			o = world
		} else {
			i, ok := index[target]
			if !ok {
				return nil, fmt.Errorf("no box with id %s", target)
			}
			o = nodes[i]
		}
		if v := value(val); v == nil {
			o.del(key)
		} else {
			o.set(key, v)
		}
	}
	nb, err := json.Marshal(nodes)
	if err != nil {
		return nil, err
	}
	doc.set("nodes", nb)
	if world != nil {
		wb, _ := world.MarshalJSON()
		doc.set("world", wb)
	}
	compact, err := doc.MarshalJSON()
	if err != nil {
		return nil, err
	}
	var out bytes.Buffer
	if err := json.Indent(&out, compact, "", "  "); err != nil {
		return nil, err
	}
	out.WriteByte('\n')
	return out.Bytes(), nil
}

// 同じフォルダに書いてから置き換える（書きかけを画面に読まれないようにする）
func writeFile(path string, b []byte) error {
	mode := os.FileMode(0o644)
	if st, err := os.Stat(path); err == nil {
		mode = st.Mode().Perm()
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), mode); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
