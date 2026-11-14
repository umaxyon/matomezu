package server

import (
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/umaxyon/matomezu/internal/storage"
)

// 一覧の件数の上限と既定（種類が aiList で決めない所）、ids で 1 回に取れる件数の上限
const (
	aiRecordsMax    = 100
	aiRecordsIDsMax = 20
)

// RecordsQuery は read_records の取り方（値は外から来た文字のまま持ち、AIRecords が確かめる）。
// ID はその 1 件の全文、IDs はその何件かの全文。どちらも無ければ一覧で、Where は 項目 = 値、Is は 索引キー → absent か present、
// Limit は件数、Before はその 1 件より後ろの続き（その 1 件は含まない）
type RecordsQuery struct {
	Kind   string
	ID     string
	IDs    []string
	Where  map[string]string
	Is     map[string]string
	Limit  string
	Before string
	// Unlisted は、一覧の既定の目次に載せない物の扱い: 無い・hide は載せる物だけ、include は全部、only は載せない物だけ
	Unlisted string
}

// AIRecords は、AI に見せる種類のレコードを、取り方 q で返す。refusal は取り方が合わないときの断る理由（AI に返す英語の文）。
// AI に見せない種類・無い種類・無いレコード（ID のとき）は ok が false。
// 一覧の既定の並びを持つ種類（aiList）は、置き場所の索引キーで探して並べ、返す件数だけ中身を読む（{"kind","records","total","older"}。
// total は条件に合う全部の数、older は返した中で最後の物より後ろの数）。持たない種類は、全部を読んでエンジンが並べる（100 行まで。{"kind","records","total"}）
func (h *Hub) AIRecords(q RecordsQuery) (out json.RawMessage, refusal string, ok bool, err error) {
	h.mu.Lock()
	kind, known := h.kinds[q.Kind]
	h.mu.Unlock()
	if !known || !kind.AI {
		return nil, "", false, nil
	}
	if q.Unlisted != "" && q.Unlisted != "hide" && q.Unlisted != "include" && q.Unlisted != "only" {
		return nil, "unlisted is hide, include or only", true, nil
	}
	listing := len(q.Where) > 0 || len(q.Is) > 0 || q.Limit != "" || q.Before != "" || q.Unlisted != ""
	if q.ID != "" {
		if listing || len(q.IDs) > 0 {
			return nil, "id cannot be given together with ids, where, limit, before or unlisted", true, nil
		}
		r, err := h.store.Record(q.Kind, q.ID)
		if err != nil || r == nil {
			return nil, "", false, err
		}
		out, err = json.Marshal(map[string]any{"kind": q.Kind, "record": r.Body})
		return out, "", err == nil, err
	}
	if len(q.IDs) > 0 {
		if listing {
			return nil, "ids cannot be given together with where, limit, before or unlisted", true, nil
		}
		if len(q.IDs) > aiRecordsIDsMax {
			return nil, fmt.Sprintf("ids takes 1 to %d ids", aiRecordsIDsMax), true, nil
		}
		records, unknown, seen := []json.RawMessage{}, []string{}, map[string]bool{}
		for _, id := range q.IDs {
			if seen[id] {
				continue
			}
			seen[id] = true
			r, err := h.store.Record(q.Kind, id)
			if err != nil {
				return nil, "", false, err
			}
			if r == nil {
				unknown = append(unknown, id)
			} else {
				records = append(records, r.Body)
			}
		}
		answer := map[string]any{"kind": q.Kind, "records": records}
		if len(unknown) > 0 {
			slices.Sort(unknown)
			answer["unknown"] = unknown
		}
		out, err = json.Marshal(answer)
		return out, "", err == nil, err
	}
	if q.Unlisted == "include" || q.Unlisted == "only" {
		if kind.AIUnlisted == "" {
			return nil, "this kind lists all its records: unlisted is for the kinds that leave some out of the list (see the index of actions)", true, nil
		}
	}
	if kind.AIList == nil {
		if len(q.Is) > 0 || q.Limit != "" || q.Before != "" {
			return nil, "this kind takes only where (it has no index keys to list by)", true, nil
		}
		return h.aiRecordsOfAll(q.Kind, q.Where, q.Unlisted)
	}
	limit := kind.AIList.Limit
	if q.Limit != "" {
		n, err := strconv.Atoi(q.Limit)
		if err != nil || n < 1 || n > aiRecordsMax {
			return nil, fmt.Sprintf("limit is an integer from 1 to %d", aiRecordsMax), true, nil
		}
		limit = n
	}
	names := make([]string, 0, len(kind.Keys))
	types := map[string]string{}
	for _, k := range kind.Keys {
		names = append(names, k.Name)
		types[k.Name] = k.Type
	}
	noKey := func(name string) string {
		return fmt.Sprintf("%s is not an index key of this kind (its index keys: %s)", name, strings.Join(names, ", "))
	}
	find := storage.Query{KeysOnly: true, Order: &storage.Order{Key: kind.AIList.Order.Key, Desc: kind.AIList.Order.Dir == "desc"}}
	for _, name := range slices.Sorted(maps.Keys(q.Where)) {
		value := q.Where[name]
		switch types[name] {
		case "text":
			find.Where = append(find.Where, storage.Cond{Key: name, Op: "eq", Value: value})
		case "number":
			n, err := strconv.ParseFloat(value, 64)
			if err != nil {
				return nil, fmt.Sprintf("%s is a number", name), true, nil
			}
			find.Where = append(find.Where, storage.Cond{Key: name, Op: "eq", Value: n})
		default:
			return nil, noKey(name), true, nil
		}
	}
	for _, name := range slices.Sorted(maps.Keys(q.Is)) {
		if _, has := types[name]; !has {
			return nil, noKey(name), true, nil
		}
		if q.Is[name] != "absent" && q.Is[name] != "present" {
			return nil, "is takes absent or present", true, nil
		}
		find.Where = append(find.Where, storage.Cond{Key: name, Op: q.Is[name]})
	}
	found, err := h.store.Find(q.Kind, find)
	if err != nil {
		return nil, "", false, err
	}
	total := len(found)
	if q.Before != "" {
		// 続きの始まりは、条件で絞る前の並びで数える（その 1 件が条件に合わなくなっていても、続きを取れる）
		all := found
		if len(find.Where) > 0 {
			if all, err = h.store.Find(q.Kind, storage.Query{KeysOnly: true, Order: find.Order}); err != nil {
				return nil, "", false, err
			}
		}
		at := slices.IndexFunc(all, func(f storage.Found) bool { return f.ID == q.Before })
		if at < 0 {
			return nil, fmt.Sprintf("no such record to go on from: %s (before takes the id of a record of this kind)", q.Before), true, nil
		}
		after := map[string]bool{}
		for _, f := range all[at+1:] {
			after[f.ID] = true
		}
		found = slices.DeleteFunc(slices.Clone(found), func(f storage.Found) bool { return !after[f.ID] })
	}
	page := found
	if len(page) > limit {
		page = page[:limit]
	}
	bodies := make([]json.RawMessage, 0, len(page))
	for _, f := range page {
		r, err := h.store.Record(q.Kind, f.ID)
		if err != nil {
			return nil, "", false, err
		}
		if r != nil {
			bodies = append(bodies, r.Body)
		}
	}
	// 題が指す先のレコードを置き場所から引くので、エンジンを呼ぶ間は h.mu を持つ（行う間と同じ）
	h.mu.Lock()
	rows, shown, err := h.engine.AIRows(q.Kind, bodies, recordSource{h})
	h.mu.Unlock()
	if err != nil || !shown {
		return nil, "", false, err
	}
	if rows == nil {
		rows = []json.RawMessage{}
	}
	out, err = json.Marshal(map[string]any{"kind": q.Kind, "records": rows, "total": total, "older": len(found) - len(page)})
	return out, "", err == nil, err
}

// aiRecordsOfAll は、一覧の既定の並びを持たない種類の一覧: 種類の全部を読み、where（トップの項目 = 値）に合う物を、unlisted（hide・include・only）に従ってエンジンが分けて並べる（100 行まで）。
// hide のときは、載せなかった数 unlisted も添える（0 なら省く）。指す先のレコードは置き場所から引くので、エンジンを呼ぶ間も h.mu を持つ（行う間と同じ）
func (h *Hub) aiRecordsOfAll(kind string, where map[string]string, unlisted string) (out json.RawMessage, refusal string, ok bool, err error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	table := h.recordTables[kind]
	ids := make([]string, 0, len(table))
	for rid := range table {
		ids = append(ids, rid)
	}
	slices.Sort(ids)
	bodies := make([]json.RawMessage, 0, len(ids))
	for _, rid := range ids {
		bodies = append(bodies, table[rid].body)
	}
	if where == nil {
		where = map[string]string{}
	}
	rows, hidden, known, err := h.engine.AIRecords(kind, bodies, where, unlisted, recordSource{h})
	if err != nil || !known {
		return nil, "", false, err
	}
	var kept []map[string]string
	for _, r := range rows {
		kept = append(kept, map[string]string{"id": r.ID, "brief": r.Brief})
	}
	total := len(kept)
	if total > aiRecordsMax {
		kept = kept[:aiRecordsMax]
	}
	if kept == nil {
		kept = []map[string]string{}
	}
	answer := map[string]any{"kind": kind, "records": kept, "total": total}
	if hidden > 0 {
		answer["unlisted"] = hidden
	}
	out, err = json.Marshal(answer)
	return out, "", err == nil, err
}

func (o Options) aiRecords(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	query := RecordsQuery{Kind: q.Get("kind"), ID: q.Get("id"), IDs: q["ids"], Limit: q.Get("limit"), Before: q.Get("before"), Unlisted: q.Get("unlisted"), Where: map[string]string{}, Is: map[string]string{}}
	if query.Kind == "" {
		http.Error(w, "kind is needed (the subjects are in the index of actions)", http.StatusBadRequest)
		return
	}
	for k, v := range q {
		if len(v) == 0 {
			continue
		}
		if name, ok := strings.CutPrefix(k, "where."); ok {
			query.Where[name] = v[0]
		} else if name, ok := strings.CutPrefix(k, "is."); ok {
			query.Is[name] = v[0]
		}
	}
	out, refusal, ok, err := o.Hub.AIRecords(query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if refusal != "" {
		http.Error(w, refusal, http.StatusBadRequest)
		return
	}
	if !ok {
		http.Error(w, fmt.Sprintf("there is no such kind or record: %s %s", query.Kind, query.ID), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(out)
}
