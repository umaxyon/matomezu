package server

// 横断検索: チケットやチケット履歴などの文字を、言葉で探す。探す仕組みは置き場所の 1 つ（storage.Search）で、画面と AI は同じ Hub.Search を呼び、返し方だけが違う。
// 探せるのは、searchTexts を書いた種類。AI の口は、さらに aiBrief を書いた種類だけ（横断検索の当たりに種類の aiBrief の 1 行を添えるため。画面の口は書かない種類も探し、brief は空）。
//
//	GET /api/ai/search（AI）・GET /api/search（画面）  ?term=言葉（何度でも。OR）&kinds=[{"kind":"種類の id","where":{"索引キー":値}}]（任意の JSON）&limit=&offset=&unlisted=hide|include|only（AI の口の既定は hide、画面の口は include）
//	  → {"total": 横断検索の当たりの総数, "hits": [{"kind","id","part"（title か body）,"brief","snippet"（当たった所の前後）,"label"?（画面の口だけ）,"of"?: {"kind","id"}（親）}], "more"?: 残りの数, "next"?: 続きの offset}

import (
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// 横断検索の件数の既定と上限、言葉の数と 1 つの長さの上限
const (
	searchLimitDefault = 20
	searchLimitMax     = 50
	searchTermsMax     = 10
	searchTermRunesMax = 100
	// 画面の口の件数の上限（当たった id を全部使うので、AI の口より大きい）
	screenSearchLimitMax = 1000
)

// SearchKind は、探す種類の絞り: 種類の id と、その種類の索引キーのこたえ。値は文字・数、{"is": "absent" か "present"}（read_records の where と同じ）
type SearchKind struct {
	Kind  string         `json:"kind"`
	Where map[string]any `json:"where,omitempty"`
}

// SearchQuery は Hub.Search の探し方。Limit が 0 なら既定の件数
type SearchQuery struct {
	Terms  []string
	Kinds  []SearchKind
	Limit  int
	Offset int
	// Unlisted は、一覧（read_records）の既定の目次に載せない物の扱い（read_records の unlisted と同じ）: hide は横断検索の当たりから除いて数だけ返す・include は含める・only は載せない物だけ。空なら hide。
	// MaxLimit は Limit の上限（0 なら searchLimitMax）
	Unlisted string
	MaxLimit int
	// Screen は画面の口か（aiBrief を書かない種類も探す）。AI の口は searchTexts と aiBrief の両方を書いた種類だけ探す
	Screen bool
}

// RecordHit は横断検索の当たり 1 件。ID はレコードの id、Brief はその種類の aiBrief の 1 行、Snippet は当たった所の前後、Of はそのレコードの親（定義の refers の先頭 1 件。親の種類も探せる種類のときだけ付ける）
type RecordHit struct {
	Kind    string `json:"kind"`
	ID      string `json:"id"`
	Part    string `json:"part"`
	Brief   string `json:"brief"`
	Snippet string `json:"snippet"`
	Label   string `json:"label,omitempty"` // 何に当たったかの名前（画面の口だけ。そのレコードの searchTexts の title、無ければ親の title、どちらも無ければ省く）
	Of      *Of    `json:"of,omitempty"`
}

// Of は、当たったレコードの親（種類と id）
type Of struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

// SearchAnswer は探した答え。Total は横断検索の当たりの総数。上限で切れたら More が残りの数、Next が続きの Offset
type SearchAnswer struct {
	Total    int         `json:"total"`
	Unlisted int         `json:"unlisted,omitempty"` // hide で横断検索の当たりから除いた数
	Hits     []RecordHit `json:"hits"`
	More     int         `json:"more,omitempty"`
	Next     int         `json:"next,omitempty"`
}

// Search は横断検索をする。refusal は探し方が合わないときの断る理由（外に返す英語の文）
func (h *Hub) Search(q SearchQuery) (answer SearchAnswer, refusal string, err error) {
	if len(q.Terms) == 0 || len(q.Terms) > searchTermsMax {
		return answer, fmt.Sprintf("terms takes 1 to %d words", searchTermsMax), nil
	}
	for _, t := range q.Terms {
		if t == "" || len([]rune(t)) > searchTermRunesMax {
			return answer, fmt.Sprintf("a word is 1 to %d characters", searchTermRunesMax), nil
		}
	}
	limit := q.Limit
	if limit == 0 {
		limit = searchLimitDefault
	}
	maxLimit := q.MaxLimit
	if maxLimit == 0 {
		maxLimit = searchLimitMax
	}
	if limit < 1 || limit > maxLimit {
		return answer, fmt.Sprintf("limit is an integer from 1 to %d", maxLimit), nil
	}
	mode := q.Unlisted
	if mode == "" {
		mode = "hide"
	}
	if mode != "hide" && mode != "include" && mode != "only" {
		return answer, "unlisted is hide, include or only", nil
	}
	if q.Offset < 0 {
		return answer, "offset is 0 or more", nil
	}
	h.mu.Lock()
	searchable := map[string]bool{}
	for subject, k := range h.kinds {
		if k.Search && (k.AI || q.Screen) {
			searchable[subject] = true
		}
	}
	h.mu.Unlock()
	names := slices.Sorted(maps.Keys(searchable))
	filters := []storage.KindFilter{}
	if len(q.Kinds) == 0 {
		for _, name := range names {
			filters = append(filters, storage.KindFilter{Kind: name})
		}
	}
	for _, k := range q.Kinds {
		if !searchable[k.Kind] {
			return answer, fmt.Sprintf("%s cannot be searched (the kinds that can: %s)", k.Kind, strings.Join(names, ", ")), nil
		}
		conds, refusal := h.searchConds(k)
		if refusal != "" {
			return answer, refusal, nil
		}
		filters = append(filters, storage.KindFilter{Kind: k.Kind, Where: conds})
	}
	answer.Hits = []RecordHit{}
	if len(filters) == 0 {
		return answer, "", nil
	}
	var keep func(kind, ref string) bool
	if mode != "include" {
		// 一覧と同じ考えで、載せない物（aiListed が決める。書かない種類は常に載る）を分ける
		unlisted := map[[2]string]bool{}
		h.mu.Lock()
		for _, f := range filters {
			bodies := map[string]json.RawMessage{}
			for id, e := range h.recordTables[f.Kind] {
				bodies[id] = e.body
			}
			ids, err := h.engine.UnlistedOf(f.Kind, bodies, recordSource{h})
			if err != nil {
				h.mu.Unlock()
				return answer, "", err
			}
			for _, id := range ids {
				unlisted[[2]string{f.Kind, id}] = true
			}
		}
		h.mu.Unlock()
		keep = func(kind, ref string) bool { return unlisted[[2]string{kind, ref}] == (mode == "only") }
	}
	found, err := h.store.Search(storage.SearchQuery{Terms: q.Terms, Kinds: filters, Limit: limit, Offset: q.Offset, Keep: keep})
	if err != nil {
		return answer, "", err
	}
	answer.Total = found.Total
	if mode == "hide" {
		answer.Unlisted = found.Skipped
	}
	// 種類ごとに、当たったレコードの aiBrief の 1 行と索引キーを引く
	bodies := map[string]map[string]json.RawMessage{}
	for _, f := range found.Hits {
		r, err := h.store.Record(f.Kind, f.Ref)
		if err != nil {
			return answer, "", err
		}
		if r == nil {
			continue
		}
		if bodies[f.Kind] == nil {
			bodies[f.Kind] = map[string]json.RawMessage{}
		}
		bodies[f.Kind][f.Ref] = r.Body
	}
	briefs := map[string]map[string]string{}
	parents := map[string]map[string]engine.Ref{}
	for kind, table := range bodies {
		ids := slices.Sorted(maps.Keys(table))
		list := make([]json.RawMessage, 0, len(ids))
		for _, id := range ids {
			list = append(list, table[id])
		}
		// 題が指す先のレコードを置き場所から引くので、エンジンを呼ぶ間は h.mu を持つ（行う間と同じ）
		h.mu.Lock()
		rows, shown, err := h.engine.AIRows(kind, list, recordSource{h})
		h.mu.Unlock()
		if err != nil {
			return answer, "", err
		}
		briefs[kind] = map[string]string{}
		if shown {
			for i, row := range rows {
				var line struct {
					Brief string `json:"brief"`
				}
				_ = json.Unmarshal(row, &line)
				briefs[kind][ids[i]] = line.Brief
			}
		}
		if parents[kind], err = h.engine.ParentsOf(kind, table); err != nil {
			return answer, "", err
		}
	}
	for _, f := range found.Hits {
		if _, has := bodies[f.Kind][f.Ref]; !has {
			continue
		}
		hit := RecordHit{Kind: f.Kind, ID: f.Ref, Part: f.Part, Brief: briefs[f.Kind][f.Ref], Snippet: f.Snippet}
		if p, ok := parents[f.Kind][f.Ref]; ok && searchable[p.Kind] {
			hit.Of = &Of{Kind: p.Kind, ID: p.ID}
		}
		if q.Screen {
			if hit.Label = f.Title; hit.Label == "" && hit.Of != nil {
				if hit.Label, err = h.titleOf(hit.Of.Kind, hit.Of.ID); err != nil {
					return answer, "", err
				}
			}
		}
		answer.Hits = append(answer.Hits, hit)
	}
	if shown := q.Offset + len(found.Hits); shown < found.Total {
		answer.More, answer.Next = found.Total-shown, shown
	}
	return answer, "", nil
}

// titleOf は、レコードの横断検索の題（searchTexts の title。レコードが無い・題が無ければ空）
func (h *Hub) titleOf(kind, id string) (string, error) {
	r, err := h.store.Record(kind, id)
	if err != nil || r == nil {
		return "", err
	}
	texts, err := h.engine.SearchTextsOf(kind, map[string]json.RawMessage{id: r.Body})
	return texts[id].Title, err
}

// searchConds は、探す種類の絞り k.Where を、索引キーの条件にする（型は種類の宣言から決める。合わなければ断る理由）
func (h *Hub) searchConds(k SearchKind) ([]storage.Cond, string) {
	h.mu.Lock()
	keys := keyIndexOf(h.kinds[k.Kind])
	h.mu.Unlock()
	var conds []storage.Cond
	for _, name := range slices.Sorted(maps.Keys(k.Where)) {
		typ, refusal := keys.typeOf(name, k.Kind)
		if refusal != "" {
			return nil, refusal
		}
		switch v := k.Where[name].(type) {
		case string:
			if typ != "text" {
				return nil, fmt.Sprintf("%s is a number", name)
			}
			conds = append(conds, storage.Cond{Key: name, Op: "eq", Value: v})
		case float64:
			if typ != "number" {
				return nil, fmt.Sprintf("%s is text", name)
			}
			conds = append(conds, storage.Cond{Key: name, Op: "eq", Value: v})
		case map[string]any:
			is, _ := v["is"].(string)
			cond, refusal := isCond(name, is)
			if refusal != "" {
				return nil, refusal
			}
			conds = append(conds, cond)
		default:
			return nil, fmt.Sprintf("where.%s is text, a number or {\"is\": \"absent\" or \"present\"}", name)
		}
	}
	return conds, ""
}

// search は GET /api/ai/search と GET /api/search の頼みを Hub.Search にする。
// AI の口は載せない物を既定で除き（unlisted の既定 hide）、件数の上限は searchLimitMax。画面の口は、横断検索の当たりを全部使うので既定で含め（include）、上限は screenSearchLimitMax
func (o Options) search(screen bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { o.searchWith(w, r, screen) }
}

func (o Options) searchWith(w http.ResponseWriter, r *http.Request, screen bool) {
	q := r.URL.Query()
	query := SearchQuery{Terms: q["term"], Unlisted: q.Get("unlisted"), Screen: screen}
	if screen {
		query.MaxLimit = screenSearchLimitMax
		if query.Unlisted == "" {
			query.Unlisted = "include"
		}
	}
	for name, dest := range map[string]*int{"limit": &query.Limit, "offset": &query.Offset} {
		if v := q.Get(name); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil {
				http.Error(w, name+" is an integer", http.StatusBadRequest)
				return
			}
			*dest = n
		}
	}
	if v := q.Get("kinds"); v != "" {
		if err := json.Unmarshal([]byte(v), &query.Kinds); err != nil {
			http.Error(w, `kinds is a JSON array of {"kind", "where"}`, http.StatusBadRequest)
			return
		}
	}
	answer, refusal, err := o.Hub.Search(query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if refusal != "" {
		http.Error(w, refusal, http.StatusBadRequest)
		return
	}
	writeJSON(w, answer)
}
