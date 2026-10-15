package main

// LLM が図の配置を調整するためのコマンド。
//
//	matomezu check [-page id] <file.json>             カレントの画面が配置した結果の要約を出す（前に出さない。D30）
//	matomezu set [-page id] <file.json> <id.key=value>...  ボックスか線（id が線の id なら線、world は図全体）の項目だけを書き換える（要約は出さない。D30）
//
// -page があれば、その箱のページ（page: true の箱の中身）の要約を出す。無ければ最初のページ。
//
// JSON 全体を読み書きせずに済むよう、書き換えは項目単位、結果は問題のあるところだけの短い要約にしている。

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/umaxyon/matomezu/internal/daemon"
	"github.com/umaxyon/matomezu/internal/server"
	"github.com/umaxyon/matomezu/internal/validate"
)

// 要約のあとに、指定した箱の子の位置と大きさを出す（-in）
const inUsage = "also list the position and size of the children of these boxes (comma separated ids), relative to the box"

func check(args []string) error {
	fs := newFlags("check")
	page := fs.String("page", "", "summarize the page of this box instead of the first page")
	in := fs.String("in", "", inUsage)
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		os.Exit(2)
	}
	if err := checkData(fs.Arg(0)); err != nil {
		return err
	}
	// 要約の問い合わせだけ。画面は前に出さず、カレントの画面が見ていないページは見えない所で並べる（D30。docs/NOTIFY-plan.md）
	s := daemon.Running()
	if s == nil {
		return errors.New("not open in a browser; run: matomezu open " + fs.Arg(0))
	}
	l, err := daemon.Summary(s, fs.Arg(0), *page)
	if err != nil {
		return err
	}
	printLayout(l, *in)
	return nil
}

// printLayout は要約と、-in で指定された箱の子の行を出す
func printLayout(l server.Layout, in string) {
	fmt.Println(l.Summary)
	for _, id := range strings.Split(in, ",") {
		if id = strings.TrimSpace(id); id == "" {
			continue
		}
		if line, ok := l.Details[id]; ok {
			fmt.Println(line)
		} else {
			fmt.Printf("in #%s: no children shown (no such box on this page, or it has no children)\n", id)
		}
	}
}

// validateCmd は図のデータの誤りを 1 行ずつ出す。無ければ ok
func validateCmd(args []string) error {
	fs := newFlags("validate")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		fs.Usage()
		os.Exit(2)
	}
	if err := checkData(fs.Arg(0)); err != nil {
		return err
	}
	fmt.Println("ok")
	return nil
}

// checkData は、ファイルに誤りがあれば全部を並べたエラーを返す（画面は誤りのあるファイルを配置しないので、配置の要約を待っても来ない）
func checkData(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return checkBytes(b, path)
}

// checkBytes は、データ b（path はエラーの文に出す名前）に誤りがあれば全部を並べたエラーを返す
func checkBytes(b []byte, path string) error {
	list, err := validate.Problems(b)
	if err != nil {
		return err
	}
	if len(list) == 0 {
		return nil
	}
	return fmt.Errorf("%d problem(s) in %s:\n  %s", len(list), path, strings.Join(list, "\n  "))
}

func set(args []string) error {
	fs := newFlags("set")
	page := fs.String("page", "", "the page (an id in pages) to edit world.* of, instead of the first page")
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
	out, notes, err := applySets(b, *page, fs.Args()[1:])
	if err != nil {
		return err
	}
	// 検査に通らない変更は書かない（画面は誤りのあるファイルを配置しないうえ、誤ったファイルが残ってしまうため）
	if err := checkBytes(out, path); err != nil {
		return fmt.Errorf("not written: %w", err)
	}
	if err := writeFile(path, out); err != nil {
		return err
	}
	// 書き換えだけ。要約は返さず、画面も切り替えない（D30。要約は matomezu check、ユーザーに知らせるのは通知）
	for _, n := range notes {
		fmt.Println(n)
	}
	fmt.Println("written (run matomezu check to see the layout)")
	return nil
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

// textKeys は、値をいつも文字列として書く項目（数字や true に見えるキャプションや色を、数や真偽値にしないため）
var textKeys = map[string]bool{"caption": true, "color": true, "title": true, "background": true}

// value は項目 key の値の文字列を JSON にする。空なら nil（項目を消す）。[ か { で始まる正しい JSON は、そのまま並びや
// オブジェクトにする（例 e3.via=[280,140,400]）。数は JSON の数として正しいものだけ（000 や 1e のようなものは文字列）
func value(key, s string) json.RawMessage {
	switch {
	case s == "":
		return nil
	case textKeys[key]:
		b, _ := json.Marshal(s)
		return b
	case s == "true" || s == "false":
		return json.RawMessage(s)
	case (strings.HasPrefix(s, "[") || strings.HasPrefix(s, "{")) && json.Valid([]byte(s)):
		return json.RawMessage(s)
	}
	if _, err := strconv.ParseFloat(s, 64); err == nil && json.Valid([]byte(s)) {
		return json.RawMessage(s)
	}
	b, _ := json.Marshal(s)
	return b
}

// applySets は "id.key=value" の並びを図に当てる。id がボックスの id ならボックス、線の id（例 e3）なら線、world なら図全体。
// value が空なら項目を消す。線の項目は id を持つものだけ書ける（画面で一度保存すると、どの線にも id が付く）。
// 線を足すのは link=1,4（矢印なども付けるなら link={"from":1,"to":4,"arrow":"end"}）、消すのは unlink=1,4 か unlink=e3。
// 区切りは , にする（> はシェルでリダイレクトになり、引用符を忘れると黙ってファイルができるため）。
// 足した線の id はこちらで振る。足した・消した線は notes で返す（LLM に知らせる）。
// 書き換えのあと、階層の違う箱どうしの線が残れば書かずに止め、消すための unlink を案内する
// page が空でなければ、world.key はそのページ（pages の id）の world を直す（無ければ最初のページ = ファイルの world）
func applySets(b []byte, page string, sets []string) ([]byte, []string, error) {
	doc, err := parseObject(b)
	if err != nil {
		return nil, nil, err
	}
	// -page のページ。pages の並びを読み、そのページの world を書き戻せるようにしておく
	var pages []*object
	var pageObj *object
	if page != "" {
		if raw, ok := doc.vals["pages"]; ok {
			var rawPages []json.RawMessage
			if err := json.Unmarshal(raw, &rawPages); err != nil {
				return nil, nil, errors.New("pages is not an array")
			}
			pages = make([]*object, len(rawPages))
			for i, r := range rawPages {
				if pages[i], err = parseObject(r); err != nil {
					return nil, nil, fmt.Errorf("page %d: %w", i, err)
				}
				if plain(pages[i].vals["id"]) == page {
					pageObj = pages[i]
				}
			}
		}
		if pageObj == nil {
			return nil, nil, fmt.Errorf("no page with id %s (ids are in pages)", page)
		}
	}
	var rawNodes []json.RawMessage
	if err := json.Unmarshal(doc.vals["nodes"], &rawNodes); err != nil {
		return nil, nil, errors.New("nodes array not found")
	}
	nodes := make([]*object, len(rawNodes))
	index := map[string]int{}
	for i, r := range rawNodes {
		if nodes[i], err = parseObject(r); err != nil {
			return nil, nil, fmt.Errorf("node %d: %w", i, err)
		}
		index[plain(nodes[i].vals["id"])] = i
	}
	var rawEdges []json.RawMessage
	if e, ok := doc.vals["edges"]; ok {
		if err := json.Unmarshal(e, &rawEdges); err != nil {
			return nil, nil, errors.New("edges is not an array")
		}
	}
	edges := make([]*edge, len(rawEdges))
	for i, r := range rawEdges {
		edges[i] = parseEdge(r)
	}
	findEdge := func(id string) int {
		for i, e := range edges {
			if e.o != nil && e.id() == id {
				return i
			}
		}
		return -1
	}
	// 箱が載るページ（最上位の祖先の page。最初のページは ""）と、ページのパターン（world.childView。無ければ内包）。
	// 箱はパターンの違うページへは移せない（docs/PATTERN-plan.md。画面と同じ）ので、書き換えの前後で比べる
	pageOf := func(id string) string {
		seen := map[string]bool{}
		for i, ok := index[id]; ok && !seen[id]; i, ok = index[id] {
			seen[id] = true
			p := plain(nodes[i].vals["parent"])
			if p == "null" {
				if pg := plain(nodes[i].vals["page"]); pg != "null" {
					return pg
				}
				return ""
			}
			id = p
		}
		return ""
	}
	patterns := map[string]string{"": patternIn(doc.vals["world"])}
	var allPages []json.RawMessage
	_ = json.Unmarshal(doc.vals["pages"], &allPages)
	for _, r := range allPages {
		if po, err := parseObject(r); err == nil {
			patterns[plain(po.vals["id"])] = patternIn(po.vals["world"])
		}
	}
	before := map[string]string{}
	for id := range index {
		before[id] = pageOf(id)
	}
	edgesChanged := false
	var notes []string
	// 同じ呼び出しで消した線の id は、足す線に振り直さない（消した線と足した線の取り違えを防ぐ）
	retired := map[string]bool{}
	var world *object
	for _, a := range sets {
		if v, ok := strings.CutPrefix(a, "link="); ok {
			e, err := newEdge(v, index, nodes, edges, retired)
			if err != nil {
				return nil, nil, fmt.Errorf("%s: %w", a, err)
			}
			edges = append(edges, e)
			edgesChanged = true
			notes = append(notes, fmt.Sprintf("added edge %s (%s)", e.id(), e.pair()))
			continue
		}
		if v, ok := strings.CutPrefix(a, "unlink="); ok {
			i := findEdge(v)
			if i < 0 {
				from, to, ok := strings.Cut(v, ",")
				if !ok {
					return nil, nil, fmt.Errorf("%s: no edge with id %s (write unlink=e3 or unlink=1,4)", a, v)
				}
				from, to = strings.TrimSpace(from), strings.TrimSpace(to)
				var hits []int
				for j, e := range edges {
					if f, t := e.ends(); (f == from && t == to) || (f == to && t == from) {
						hits = append(hits, j)
					}
				}
				if len(hits) == 0 {
					return nil, nil, fmt.Errorf("%s: no edge between %s and %s", a, from, to)
				}
				if len(hits) > 1 {
					var ids []string
					for _, j := range hits {
						ids = append(ids, edges[j].label())
					}
					return nil, nil, fmt.Errorf("%s: %d edges between %s and %s (%s); remove one by its id, e.g. unlink=%s", a, len(hits), from, to, strings.Join(ids, ", "), edges[hits[0]].id())
				}
				i = hits[0]
			}
			notes = append(notes, fmt.Sprintf("removed edge %s", edges[i].label()))
			retired[edges[i].id()] = true
			edges = append(edges[:i], edges[i+1:]...)
			edgesChanged = true
			continue
		}
		target, rest, ok1 := strings.Cut(a, ".")
		key, val, ok2 := strings.Cut(rest, "=")
		if !ok1 || !ok2 || key == "" {
			return nil, nil, fmt.Errorf("expected id.key=value, link=from,to or unlink=from,to: %s", a)
		}
		var o *object
		if target == "world" {
			if world == nil {
				holder := doc
				if pageObj != nil {
					holder = pageObj
				}
				if w, ok := holder.vals["world"]; ok {
					if world, err = parseObject(w); err != nil {
						return nil, nil, fmt.Errorf("world: %w", err)
					}
				} else {
					world = &object{vals: map[string]json.RawMessage{}}
				}
			}
			o = world
		} else if i, ok := index[target]; ok {
			o = nodes[i]
		} else if i := findEdge(target); i >= 0 {
			o = edges[i].o
			edgesChanged = true
		} else {
			return nil, nil, fmt.Errorf("no box or edge with id %s", target)
		}
		if v := value(key, val); v == nil {
			o.del(key)
		} else {
			o.set(key, v)
		}
	}
	var moved []string
	for id, from := range before {
		to := pageOf(id)
		pf, pt := patternOf(patterns, from), patternOf(patterns, to)
		if from != to && pf != pt {
			moved = append(moved, fmt.Sprintf("box %s would move from a %s page to a %s page", id, pf, pt))
		}
	}
	if len(moved) > 0 {
		sort.Strings(moved)
		return nil, nil, fmt.Errorf("not written: %s; boxes can't move between pages of different patterns (to relate them, put a link box (link) to the other page and draw an edge to it)", strings.Join(moved, "; "))
	}
	// 付け替えで階層をまたいだ線。画面の検査でも止まるが、ここで消し方まで示す
	parentOf := func(id string) string {
		if i, ok := index[id]; ok {
			if p := plain(nodes[i].vals["parent"]); p != "null" {
				return p
			}
		}
		return ""
	}
	var crossing []string
	for _, e := range edges {
		f, t := e.ends()
		if pf, pt := parentOf(f), parentOf(t); pf != pt {
			crossing = append(crossing, fmt.Sprintf("edge %s joins boxes in different groups (%s is %s, %s is %s); add unlink=%s to remove it",
				e.label(), f, where(pf), t, where(pt), e.pair()))
		}
	}
	if len(crossing) > 0 {
		return nil, nil, fmt.Errorf("not written: %s", strings.Join(crossing, "; "))
	}
	nb, err := json.Marshal(nodes)
	if err != nil {
		return nil, nil, err
	}
	doc.set("nodes", nb)
	if edgesChanged {
		out := make([]json.RawMessage, len(edges))
		for i, e := range edges {
			if out[i], err = e.marshal(); err != nil {
				return nil, nil, err
			}
		}
		eb, err := json.Marshal(out)
		if err != nil {
			return nil, nil, err
		}
		doc.set("edges", eb)
	}
	if world != nil {
		wb, _ := world.MarshalJSON()
		if pageObj != nil {
			pageObj.set("world", wb)
			pb, err := json.Marshal(pages)
			if err != nil {
				return nil, nil, err
			}
			doc.set("pages", pb)
		} else {
			doc.set("world", wb)
		}
	}
	compact, err := doc.MarshalJSON()
	if err != nil {
		return nil, nil, err
	}
	out, err := formatDiagram(compact)
	return out, notes, err
}

// patternIn はページの world の childView（ページのパターン）。無ければ内包（nest）
func patternIn(world json.RawMessage) string {
	var w struct {
		ChildView string `json:"childView"`
	}
	if json.Unmarshal(world, &w) == nil && w.ChildView != "" {
		return w.ChildView
	}
	return "nest"
}

// patternOf はページ（id）のパターン。無いページは内包として扱う（無いページは validate が知らせる）
func patternOf(patterns map[string]string, page string) string {
	if p, ok := patterns[page]; ok {
		return p
	}
	return "nest"
}

// where は箱の居場所の説明（親の id か最上位）
func where(parent string) string {
	if parent == "" {
		return "at the top level"
	}
	return "in " + parent
}

// plain は JSON の値（id など）を比べるための文字列にする。文字列は引用符を外す
func plain(v json.RawMessage) string {
	var s string
	if json.Unmarshal(v, &s) == nil {
		return s
	}
	if len(v) == 0 {
		return "null"
	}
	return string(v)
}

// edge は線 1 本。オブジェクトの形なら o、[from, to] の形なら raw だけを持つ
type edge struct {
	raw json.RawMessage
	o   *object
}

func parseEdge(r json.RawMessage) *edge {
	e := &edge{raw: r}
	if o, err := parseObject(r); err == nil {
		e.o = o
	}
	return e
}

func (e *edge) id() string {
	if e.o == nil {
		return ""
	}
	if v, ok := e.o.vals["id"]; ok {
		return plain(v)
	}
	return ""
}

func (e *edge) ends() (string, string) {
	if e.o != nil {
		return plain(e.o.vals["from"]), plain(e.o.vals["to"])
	}
	var pair []json.RawMessage
	if json.Unmarshal(e.raw, &pair) == nil && len(pair) >= 2 {
		return plain(pair[0]), plain(pair[1])
	}
	return "", ""
}

func (e *edge) pair() string {
	f, t := e.ends()
	return f + "," + t
}

// label は知らせに出す名前（例 e3 (1,4)。id が無ければ 1,4）
func (e *edge) label() string {
	if id := e.id(); id != "" {
		return e.id() + " (" + e.pair() + ")"
	}
	return e.pair()
}

func (e *edge) marshal() (json.RawMessage, error) {
	if e.o == nil {
		return e.raw, nil
	}
	return e.o.MarshalJSON()
}

// newEdge は link= の値（1,4 か、from と to を持つ JSON のオブジェクト）から線を作る。id が無ければ空いている e<数> を振る。
// 画面と同じく、同じ 2 つの箱の間に 2 本目は引かない（自分に戻る線は何本でも）
func newEdge(v string, index map[string]int, nodes []*object, edges []*edge, retired map[string]bool) (*edge, error) {
	var o *object
	if strings.HasPrefix(v, "{") {
		var err error
		if o, err = parseObject([]byte(v)); err != nil {
			return nil, fmt.Errorf("invalid JSON: %w", err)
		}
	} else {
		from, to, ok := strings.Cut(v, ",")
		if !ok {
			return nil, errors.New("expected link=from,to, e.g. link=1,4")
		}
		o = &object{vals: map[string]json.RawMessage{}}
		for k, id := range map[string]string{"from": strings.TrimSpace(from), "to": strings.TrimSpace(to)} {
			if i, ok := index[id]; ok {
				o.set(k, nodes[i].vals["id"])
			} else {
				o.set(k, json.RawMessage(strconv.Quote(id)))
			}
		}
		o.keys = []string{"from", "to"}
	}
	e := &edge{o: o}
	from, to := e.ends()
	for _, id := range []string{from, to} {
		if _, ok := index[id]; !ok {
			return nil, fmt.Errorf("no box with id %s", id)
		}
	}
	used := map[string]bool{}
	for _, x := range edges {
		used[x.id()] = true
		if f, t := x.ends(); from != to && ((f == from && t == to) || (f == to && t == from)) {
			return nil, fmt.Errorf("boxes %s and %s are already joined by edge %s", from, to, x.label())
		}
	}
	if id := e.id(); id != "" {
		if used[id] {
			return nil, fmt.Errorf("edge id %s is already used", id)
		}
		return e, nil
	}
	n := 1
	for used["e"+strconv.Itoa(n)] || retired["e"+strconv.Itoa(n)] {
		n++
	}
	id, _ := json.Marshal("e" + strconv.Itoa(n))
	o.keys = append([]string{"id"}, o.keys...)
	o.vals["id"] = id
	return e, nil
}

// 図のデータを保存する形にする（web/src/format.ts と同じ形）。最上位のキーを 1 行ずつ、
// その値の配列（nodes・edges など）は要素 1 つを 1 行に書く。区切りの後ろと、中身のある {} の内側に空白を入れる
func formatDiagram(b []byte) ([]byte, error) {
	var c bytes.Buffer
	if err := json.Compact(&c, b); err != nil {
		return nil, err
	}
	in := c.Bytes()
	var out bytes.Buffer
	// 開いている括弧ごとに、要素を行に分けるか（最上位の {} と、その値の []）
	var open []bool
	inStr, esc := false, false
	for i, ch := range in {
		if inStr {
			out.WriteByte(ch)
			if esc {
				esc = false
			} else if ch == '\\' {
				esc = true
			} else if ch == '"' {
				inStr = false
			}
			continue
		}
		next := byte(0)
		if i+1 < len(in) {
			next = in[i+1]
		}
		lines := len(open) > 0 && open[len(open)-1]
		indent := "\n" + strings.Repeat("  ", len(open))
		switch ch {
		case '"':
			inStr = true
			out.WriteByte(ch)
		case '{', '[':
			split := len(open) == 0 || (len(open) == 1 && ch == '[')
			open = append(open, split)
			out.WriteByte(ch)
			switch {
			case next == '}' || next == ']':
			case split:
				out.WriteString(indent + "  ")
			case ch == '{':
				out.WriteByte(' ')
			}
		case '}', ']':
			empty := i > 0 && (in[i-1] == '{' || in[i-1] == '[')
			open = open[:len(open)-1]
			switch {
			case empty:
			case lines:
				out.WriteString("\n" + strings.Repeat("  ", len(open)))
			case ch == '}':
				out.WriteByte(' ')
			}
			out.WriteByte(ch)
		case ',':
			if lines {
				out.WriteString("," + indent)
			} else {
				out.WriteString(", ")
			}
		case ':':
			out.WriteString(": ")
		default:
			out.WriteByte(ch)
		}
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
