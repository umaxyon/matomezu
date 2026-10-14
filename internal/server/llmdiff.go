package server

// 図の JSON の差分（LLM の履歴。llmhist.go。D31）。箱（nodes）・線（edges）・ページ（pages）・消した箱（removed）は id ごと、
// world とそのほかの最上位の項目は項目ごとに比べる。箱の並び順（リストの並びなど）が変われば order の 1 件にする。
// 取り消し（revertChanges）は、今の中身にその差分の逆を当てる: 足した物は消し（箱なら子孫と、つながる線も）、消した物は戻し、
// 変えた項目は前の値に戻す（後から別の人が変えていても、前の値で上書きする。2026-10-15 ユーザー）

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
)

// Change は差分の 1 件。Op は add（足した）/ remove（消した）/ change（項目を変えた）/ order（箱の並び順）。
// add と remove の Before・After は物の全体、change は変えた項目だけ（Fields に項目の名前。Before に無い項目は、前は無かった）
type Change struct {
	Kind   string                     `json:"kind"` // node / edge / page / removed / world / top / order
	Key    string                     `json:"key"`
	Op     string                     `json:"op"`
	Fields []string                   `json:"fields,omitempty"`
	Before map[string]json.RawMessage `json:"before,omitempty"`
	After  map[string]json.RawMessage `json:"after,omitempty"`
	From   json.RawMessage            `json:"from,omitempty"` // add・remove の物の全体（remove は消す前、add は足した後）・order の前の並び
	To     json.RawMessage            `json:"to,omitempty"`   // order の後の並び
	At     *int                       `json:"at,omitempty"`   // add: 足した後の並びでの位置 / remove: 消す前の位置（戻すときはその位置に入れる）
}

var collections = []struct{ name, kind string }{{"nodes", "node"}, {"edges", "edge"}, {"pages", "page"}, {"removed", "removed"}}

type item struct {
	key string
	raw json.RawMessage
	obj map[string]json.RawMessage // オブジェクトでなければ nil（線の [from, to] の形など）
}

func parseDoc(b []byte) (map[string]json.RawMessage, error) {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	if m == nil {
		m = map[string]json.RawMessage{}
	}
	return m, nil
}

func keyOf(kind string, raw json.RawMessage, obj map[string]json.RawMessage) string {
	if obj != nil {
		if id, ok := obj["id"]; ok {
			return scalar(id)
		}
		if kind == "edge" {
			return scalar(obj["from"]) + ">" + scalar(obj["to"])
		}
		return ""
	}
	var arr []json.RawMessage
	if kind == "edge" && json.Unmarshal(raw, &arr) == nil && len(arr) >= 2 {
		return scalar(arr[0]) + ">" + scalar(arr[1])
	}
	return ""
}

// scalar は id の値を文字列にする（1 と "1" は同じ箱）
func scalar(raw json.RawMessage) string {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	return string(bytes.TrimSpace(raw))
}

func items(m map[string]json.RawMessage, name, kind string) []item {
	var arr []json.RawMessage
	if json.Unmarshal(m[name], &arr) != nil {
		return nil
	}
	out := make([]item, 0, len(arr))
	for i, raw := range arr {
		var obj map[string]json.RawMessage
		if json.Unmarshal(raw, &obj) != nil {
			obj = nil
		}
		k := keyOf(kind, raw, obj)
		if k == "" {
			k = fmt.Sprintf("#%d", i)
		}
		out = append(out, item{k, raw, obj})
	}
	return out
}

func same(a, b json.RawMessage) bool {
	if bytes.Equal(a, b) {
		return true
	}
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return false
	}
	return reflect.DeepEqual(x, y)
}

// fieldDiff はオブジェクトどうしの、変わった項目
func fieldDiff(a, b map[string]json.RawMessage) (fields []string, before, after map[string]json.RawMessage) {
	before, after = map[string]json.RawMessage{}, map[string]json.RawMessage{}
	seen := map[string]bool{}
	for k := range a {
		seen[k] = true
	}
	for k := range b {
		seen[k] = true
	}
	for k := range seen {
		va, oka := a[k]
		vb, okb := b[k]
		if oka == okb && (!oka || same(va, vb)) {
			continue
		}
		fields = append(fields, k)
		if oka {
			before[k] = va
		}
		if okb {
			after[k] = vb
		}
	}
	sort.Strings(fields)
	return fields, before, after
}

// diffDocs は a から b への差分。読めなければ nil
func diffDocs(a, b []byte) []Change {
	ma, err1 := parseDoc(a)
	mb, err2 := parseDoc(b)
	if err1 != nil || err2 != nil {
		return nil
	}
	var out []Change
	for _, c := range collections {
		ia, ib := items(ma, c.name, c.kind), items(mb, c.name, c.kind)
		byA := map[string]item{}
		for _, x := range ia {
			byA[x.key] = x
		}
		byB := map[string]item{}
		for _, x := range ib {
			byB[x.key] = x
		}
		posA, posB := map[string]int{}, map[string]int{}
		for i, x := range ia {
			posA[x.key] = i
		}
		for i, y := range ib {
			posB[y.key] = i
		}
		at := func(m map[string]int, k string) *int { v := m[k]; return &v }
		for _, x := range ia {
			y, ok := byB[x.key]
			switch {
			case !ok:
				out = append(out, Change{Kind: c.kind, Key: x.key, Op: "remove", From: x.raw, At: at(posA, x.key)})
			case x.obj != nil && y.obj != nil:
				if f, bf, af := fieldDiff(x.obj, y.obj); len(f) > 0 {
					out = append(out, Change{Kind: c.kind, Key: x.key, Op: "change", Fields: f, Before: bf, After: af})
				}
			case !same(x.raw, y.raw):
				out = append(out, Change{Kind: c.kind, Key: x.key, Op: "remove", From: x.raw, At: at(posA, x.key)}, Change{Kind: c.kind, Key: x.key, Op: "add", From: y.raw, At: at(posB, x.key)})
			}
		}
		for _, y := range ib {
			if _, ok := byA[y.key]; !ok {
				out = append(out, Change{Kind: c.kind, Key: y.key, Op: "add", From: y.raw, At: at(posB, y.key)})
			}
		}
		// 箱の並び順（両方にある箱の、前後の並び）
		if c.kind == "node" {
			var oa, ob []string
			for _, x := range ia {
				if _, ok := byB[x.key]; ok {
					oa = append(oa, x.key)
				}
			}
			for _, y := range ib {
				if _, ok := byA[y.key]; ok {
					ob = append(ob, y.key)
				}
			}
			if !reflect.DeepEqual(oa, ob) {
				fa, _ := json.Marshal(oa)
				fb, _ := json.Marshal(ob)
				out = append(out, Change{Kind: "order", Key: "nodes", Op: "order", From: fa, To: fb})
			}
		}
	}
	// world と、そのほかの最上位の項目
	var wa, wb map[string]json.RawMessage
	json.Unmarshal(ma["world"], &wa)
	json.Unmarshal(mb["world"], &wb)
	if f, bf, af := fieldDiff(wa, wb); len(f) > 0 {
		out = append(out, Change{Kind: "world", Op: "change", Fields: f, Before: bf, After: af})
	}
	skip := map[string]bool{"world": true, "nodes": true, "edges": true, "pages": true, "removed": true}
	ta, tb := map[string]json.RawMessage{}, map[string]json.RawMessage{}
	for k, v := range ma {
		if !skip[k] {
			ta[k] = v
		}
	}
	for k, v := range mb {
		if !skip[k] {
			tb[k] = v
		}
	}
	if f, bf, af := fieldDiff(ta, tb); len(f) > 0 {
		out = append(out, Change{Kind: "top", Op: "change", Fields: f, Before: bf, After: af})
	}
	return out
}

// touched は差分が触った物と項目（"node:3:x" の形。足した・消した物は "node:3:*"）
func touched(chs []Change) map[string]bool {
	out := map[string]bool{}
	for _, c := range chs {
		switch c.Op {
		case "add", "remove":
			out[c.Kind+":"+c.Key+":*"] = true
		case "order":
			out["order:nodes:*"] = true
		default:
			for _, f := range c.Fields {
				out[c.Kind+":"+c.Key+":"+f] = true
			}
		}
	}
	return out
}

// revertChanges は cur に chs の逆を当てた中身（後ろの差分から戻す）
func revertChanges(cur []byte, chs []Change) ([]byte, error) {
	m, err := parseDoc(cur)
	if err != nil {
		return nil, err
	}
	lists := map[string][]item{}
	for _, c := range collections {
		lists[c.kind] = items(m, c.name, c.kind)
	}
	find := func(kind, key string) int {
		for i, x := range lists[kind] {
			if x.key == key {
				return i
			}
		}
		return -1
	}
	removeNode := func(key string) {
		// 子孫も消す（LLM が足した箱の中に、後からユーザーが足した子があっても消す。足した物の取り消しは子ごと。2026-10-15 ユーザー）
		gone := map[string]bool{key: true}
		for grew := true; grew; {
			grew = false
			for _, x := range lists["node"] {
				if p, ok := x.obj["parent"]; ok && !gone[x.key] && gone[scalar(p)] {
					gone[x.key] = true
					grew = true
				}
			}
		}
		var keep []item
		for _, x := range lists["node"] {
			if !gone[x.key] {
				keep = append(keep, x)
			}
		}
		lists["node"] = keep
		var edges []item
		for _, e := range lists["edge"] {
			from, to := "", ""
			if e.obj != nil {
				from, to = scalar(e.obj["from"]), scalar(e.obj["to"])
			} else {
				var arr []json.RawMessage
				if json.Unmarshal(e.raw, &arr) == nil && len(arr) >= 2 {
					from, to = scalar(arr[0]), scalar(arr[1])
				}
			}
			if !gone[from] && !gone[to] {
				edges = append(edges, e)
			}
		}
		lists["edge"] = edges
	}
	setFields := func(obj map[string]json.RawMessage, c Change) {
		for _, f := range c.Fields {
			if v, ok := c.Before[f]; ok {
				obj[f] = v
			} else {
				delete(obj, f)
			}
		}
	}
	var world map[string]json.RawMessage
	json.Unmarshal(m["world"], &world)
	// 当てる順: 足した物を消す・項目を戻す → 消した物を戻す（元の位置の小さい順。位置がずれないように）→ 並び順
	var first, back, order []Change
	for i := len(chs) - 1; i >= 0; i-- {
		switch c := chs[i]; {
		case c.Kind == "order":
			order = append(order, c)
		case c.Op == "remove":
			back = append(back, c)
		default:
			first = append(first, c)
		}
	}
	sort.SliceStable(back, func(a, b int) bool {
		pa, pb := 1<<30, 1<<30
		if back[a].At != nil {
			pa = *back[a].At
		}
		if back[b].At != nil {
			pb = *back[b].At
		}
		return pa < pb
	})
	for _, c := range append(append(first, back...), order...) {
		switch {
		case c.Kind == "world":
			if world == nil {
				world = map[string]json.RawMessage{}
			}
			setFields(world, c)
		case c.Kind == "top":
			setFields(m, c)
		case c.Kind == "order":
			var before []string
			json.Unmarshal(c.From, &before)
			rank := map[string]int{}
			for i, k := range before {
				rank[k] = i
			}
			// 前の並びにある箱どうしを前の順にし、ほかの箱の位置は変えない
			list := lists["node"]
			var slots []int
			var picked []item
			for i, x := range list {
				if _, ok := rank[x.key]; ok {
					slots = append(slots, i)
					picked = append(picked, x)
				}
			}
			sort.SliceStable(picked, func(a, b int) bool { return rank[picked[a].key] < rank[picked[b].key] })
			for j, i := range slots {
				list[i] = picked[j]
			}
		case c.Op == "add":
			if c.Kind == "node" {
				removeNode(c.Key)
			} else if i := find(c.Kind, c.Key); i >= 0 {
				lists[c.Kind] = append(lists[c.Kind][:i], lists[c.Kind][i+1:]...)
			}
		case c.Op == "remove":
			if find(c.Kind, c.Key) < 0 {
				var obj map[string]json.RawMessage
				if json.Unmarshal(c.From, &obj) != nil {
					obj = nil
				}
				list := lists[c.Kind]
				pos := len(list)
				if c.At != nil && *c.At < pos {
					pos = *c.At
				}
				list = append(list, item{})
				copy(list[pos+1:], list[pos:])
				list[pos] = item{c.Key, c.From, obj}
				lists[c.Kind] = list
			}
		case c.Op == "change":
			if i := find(c.Kind, c.Key); i >= 0 && lists[c.Kind][i].obj != nil {
				setFields(lists[c.Kind][i].obj, c)
			}
		}
	}
	if world != nil {
		m["world"], _ = json.Marshal(world)
	}
	for _, c := range collections {
		list := lists[c.kind]
		if _, had := m[c.name]; !had && len(list) == 0 {
			continue
		}
		arr := make([]json.RawMessage, len(list))
		for i, x := range list {
			if x.obj != nil {
				arr[i], _ = json.Marshal(x.obj)
			} else {
				arr[i] = x.raw
			}
		}
		m[c.name], _ = json.Marshal(arr)
	}
	b, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := json.Indent(&buf, b, "", "  "); err != nil {
		return nil, err
	}
	buf.WriteByte('\n')
	return buf.Bytes(), nil
}
