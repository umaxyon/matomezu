package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
)

// aiRecordsLimit は、read_records の一覧が 1 度に返す行数の上限（超えたら total で知らせ、where で絞らせる）
const aiRecordsLimit = 100

// AIRecords は、AI に見せる種類 kind のレコードを返す: id があればその 1 件（{"kind","record"}）、無ければ where（トップの項目 = 値）に合う物の一覧
// （{"kind","records":[{"id","brief"}],"total"}）。AI に見せない種類・無い種類・無いレコードは ok が false
func (h *Hub) AIRecords(kind, id string, where map[string]string) (out json.RawMessage, ok bool, err error) {
	h.mu.Lock()
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
	h.mu.Unlock()
	rows, known, err := h.engine.AIRecords(kind, bodies)
	if err != nil || !known {
		return nil, false, err
	}
	if id != "" {
		for i, rid := range ids {
			if rid == id {
				out, err = json.Marshal(map[string]any{"kind": kind, "record": bodies[i]})
				return out, err == nil, err
			}
		}
		return nil, false, nil
	}
	byID := map[string]json.RawMessage{}
	for i, rid := range ids {
		byID[rid] = bodies[i]
	}
	var kept []map[string]string
	for _, r := range rows {
		if matches(byID[r.ID], where) {
			kept = append(kept, map[string]string{"id": r.ID, "brief": r.Brief})
		}
	}
	total := len(kept)
	if total > aiRecordsLimit {
		kept = kept[:aiRecordsLimit]
	}
	if kept == nil {
		kept = []map[string]string{}
	}
	out, err = json.Marshal(map[string]any{"kind": kind, "records": kept, "total": total})
	return out, err == nil, err
}

// matches は、レコード body のトップの項目が where の値と全部同じか（文字列はそのまま、ほかは JSON の書き方で比べる）
func matches(body json.RawMessage, where map[string]string) bool {
	if len(where) == 0 {
		return true
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(body, &fields) != nil {
		return false
	}
	for k, want := range where {
		raw, has := fields[k]
		if !has {
			return false
		}
		var s string
		if json.Unmarshal(raw, &s) != nil {
			s = string(raw)
		}
		if s != want {
			return false
		}
	}
	return true
}

func (o Options) aiRecords(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	kind := q.Get("kind")
	if kind == "" {
		http.Error(w, "kind is needed (the subjects are in the index of actions)", http.StatusBadRequest)
		return
	}
	where := map[string]string{}
	for k, v := range q {
		if name, ok := strings.CutPrefix(k, "where."); ok && len(v) > 0 {
			where[name] = v[0]
		}
	}
	out, ok, err := o.Hub.AIRecords(kind, q.Get("id"), where)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !ok {
		http.Error(w, fmt.Sprintf("there is no such kind or record: %s %s", kind, q.Get("id")), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(out)
}
