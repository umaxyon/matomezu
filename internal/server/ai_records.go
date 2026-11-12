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

// AIRecords は、AI に見せる種類 kind のレコードを返す: id があればその 1 件（{"kind","record"}）、無ければ where（トップの項目 = 値。絞るのはエンジン）に合う物の一覧
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
	rows, known, err := h.engine.AIRecords(kind, bodies, where)
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
	var kept []map[string]string
	for _, r := range rows {
		kept = append(kept, map[string]string{"id": r.ID, "brief": r.Brief})
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
