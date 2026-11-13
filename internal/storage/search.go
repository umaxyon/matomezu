package storage

import (
	"database/sql"
	"fmt"
	"slices"
	"strings"
	"unicode"
)

// 横断検索の仕組み。文字は search_docs（種類と参照先）と search_fts（FTS5 の trigram。題と本文）に、同じ rowid で置く。
// FTS5 の UNINDEXED の列は索引が効かないので、種類と参照先は FTS 側に置かない。
// 3 字以上の言葉は MATCH、1〜2 字の言葉は trigram では当たらないので LIKE で探す（遅く、横断検索の当たりも多いので、使う側が避ける）

// SnippetAround は、当たった所の切り出しで、当たった言葉の前後に残す字数
const SnippetAround = 20

const (
	partTitle = "title"
	partBody  = "body"
	// 題に当たった物を本文だけに当たった物より上に並べるための、bm25 の列の重み（題・本文）
	weightTitle = 10.0
	weightBody  = 1.0
)

// KindFilter は、探す種類を絞る: 種類 Kind と、その種類の索引キーでの絞り（Find の Where と同じ。宣言に無いキーは ErrUnknownKey）
type KindFilter struct {
	Kind  string
	Where []Cond
}

// SearchQuery は探し方: Terms のどれかを含む物（OR）を、Kinds に絞って（無ければ全部の種類）、Offset 件目から Limit 件まで。
// Keep があれば、それが false を返す横断検索の当たりは横断検索の当たりと総数から除き、数だけ Skipped に残す
type SearchQuery struct {
	Terms  []string
	Kinds  []KindFilter
	Limit  int
	Offset int
	Keep   func(kind, ref string) bool
}

// SearchFound は横断検索の当たり 1 件: 種類と参照先、当たった所（title か body）と、その前後の切り出しと、題
type SearchFound struct {
	Kind    string
	Ref     string
	Part    string
	Snippet string
	Title   string // 当たった文字の題（searchTexts の title。無ければ空）
}

// SearchResult は探した答え: 横断検索の当たりの総数（Keep が除いた物は含めない）、除いた数 Skipped と、Offset 件目から Limit 件までの当たり（題の当たり → 本文の当たりの順）
type SearchResult struct {
	Total   int
	Skipped int
	Hits    []SearchFound
}

// txPutSearchText は、探す文字 1 件を置き換える（rowid は同じ種類・参照先で変えない。消すか、題も本文も空なら消す）
func txPutSearchText(tx *sql.Tx, t SearchText) error {
	var rowid int64
	err := tx.QueryRow(`SELECT rowid FROM search_docs WHERE kind = ? AND ref = ?`, t.Kind, t.Ref).Scan(&rowid)
	have := err == nil
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if t.Removed || (t.Title == "" && t.Body == "") {
		if !have {
			return nil
		}
		if _, err := tx.Exec(`DELETE FROM search_fts WHERE rowid = ?`, rowid); err != nil {
			return err
		}
		_, err := tx.Exec(`DELETE FROM search_docs WHERE rowid = ?`, rowid)
		return err
	}
	if !have {
		res, err := tx.Exec(`INSERT INTO search_docs (kind, ref) VALUES (?, ?)`, t.Kind, t.Ref)
		if err != nil {
			return err
		}
		if rowid, err = res.LastInsertId(); err != nil {
			return err
		}
	} else if _, err := tx.Exec(`DELETE FROM search_fts WHERE rowid = ?`, rowid); err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO search_fts (rowid, title, body) VALUES (?, ?, ?)`, rowid, t.Title, t.Body)
	return err
}

func (s *sqliteStorage) SyncSearch(keep []string, texts []SearchText) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	alive := map[string]bool{}
	for _, k := range keep {
		alive[k] = true
	}
	wanted := map[[2]string]bool{}
	for _, t := range texts {
		if alive[t.Kind] && !t.Removed && (t.Title != "" || t.Body != "") {
			wanted[[2]string{t.Kind, t.Ref}] = true
		}
	}
	rows, err := tx.Query(`SELECT kind, ref FROM search_docs`)
	if err != nil {
		return err
	}
	var gone []SearchText
	for rows.Next() {
		var kind, ref string
		if err := rows.Scan(&kind, &ref); err != nil {
			rows.Close()
			return err
		}
		if !alive[kind] || !wanted[[2]string{kind, ref}] {
			gone = append(gone, SearchText{Kind: kind, Ref: ref, Removed: true})
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, t := range gone {
		if err := txPutSearchText(tx, t); err != nil {
			return err
		}
	}
	for _, t := range texts {
		if !alive[t.Kind] {
			continue
		}
		if err := txPutSearchText(tx, t); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// likeEscape は、LIKE の言葉の中の % _ \ を、そのままの字として当たるようにする（ESCAPE '\' と対で使う）
func likeEscape(term string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(term)
}

// matchExpr は、3 字以上の言葉を MATCH の式にする（各言葉を " で包み、中の " は二重にして、OR でつなぐ）
func matchExpr(terms []string) string {
	quoted := make([]string, len(terms))
	for i, t := range terms {
		quoted[i] = `"` + strings.ReplaceAll(t, `"`, `""`) + `"`
	}
	return strings.Join(quoted, " OR ")
}

// likeClause は、列 cols のどれかが 1〜2 字の言葉 terms のどれかを含む、という条件と引数
func likeClause(cols []string, terms []string) (string, []any) {
	var parts []string
	var args []any
	for _, t := range terms {
		for _, c := range cols {
			parts = append(parts, c+` LIKE ? ESCAPE '\'`)
			args = append(args, "%"+likeEscape(t)+"%")
		}
	}
	return "(" + strings.Join(parts, " OR ") + ")", args
}

type searchRow struct {
	rowid     int64
	kind, ref string
	rank      float64
	inTitle   bool
}

// kindFilterSQL は、探す種類の絞りを、search_docs（別名 d）への条件にする（絞りが無ければ空）
func (s *sqliteStorage) kindFilterSQL(filters []KindFilter) (string, []any, error) {
	if len(filters) == 0 {
		return "", nil, nil
	}
	var parts []string
	var args []any
	for _, f := range filters {
		if len(f.Where) == 0 {
			parts = append(parts, `d.kind = ?`)
			args = append(args, f.Kind)
			continue
		}
		k, ok := s.kinds[f.Kind]
		if !ok {
			return "", nil, ErrUnknownKey
		}
		conds, condArgs, err := condSQL(k, f.Where)
		if err != nil {
			return "", nil, err
		}
		parts = append(parts, `(d.kind = ? AND d.ref IN (SELECT id FROM `+k.table+` WHERE `+strings.Join(conds, " AND ")+`))`)
		args = append(args, f.Kind)
		args = append(args, condArgs...)
	}
	return "(" + strings.Join(parts, " OR ") + ")", args, nil
}

func (s *sqliteStorage) Search(q SearchQuery) (SearchResult, error) {
	var long, short, terms []string
	seen := map[string]bool{}
	for _, t := range q.Terms {
		if t == "" || seen[t] {
			continue
		}
		seen[t] = true
		terms = append(terms, t)
		if len([]rune(t)) >= 3 {
			long = append(long, t)
		} else {
			short = append(short, t)
		}
	}
	if len(terms) == 0 {
		return SearchResult{Hits: []SearchFound{}}, nil
	}
	filter, filterArgs, err := s.kindFilterSQL(q.Kinds)
	if err != nil {
		return SearchResult{}, err
	}
	and := ""
	if filter != "" {
		and = " AND " + filter
	}

	rows := map[int64]*searchRow{}
	collect := func(query string, args []any, ranked bool) error {
		res, err := s.db.Query(query, args...)
		if err != nil {
			return err
		}
		defer res.Close()
		for res.Next() {
			var r searchRow
			dest := []any{&r.rowid, &r.kind, &r.ref}
			if ranked {
				dest = append(dest, &r.rank)
			}
			if err := res.Scan(dest...); err != nil {
				return err
			}
			if have, ok := rows[r.rowid]; ok {
				if ranked {
					have.rank = r.rank
				}
				continue
			}
			rows[r.rowid] = &r
		}
		return res.Err()
	}
	if len(long) > 0 {
		args := append([]any{matchExpr(long)}, filterArgs...)
		if err := collect(fmt.Sprintf(`SELECT d.rowid, d.kind, d.ref, bm25(search_fts, %v, %v) FROM search_fts JOIN search_docs d ON d.rowid = search_fts.rowid WHERE search_fts MATCH ?%s`, weightTitle, weightBody, and), args, true); err != nil {
			return SearchResult{}, err
		}
	}
	if len(short) > 0 {
		like, likeArgs := likeClause([]string{"search_fts.title", "search_fts.body"}, short)
		if err := collect(`SELECT d.rowid, d.kind, d.ref FROM search_docs d JOIN search_fts ON search_fts.rowid = d.rowid WHERE `+like+and, append(likeArgs, filterArgs...), false); err != nil {
			return SearchResult{}, err
		}
	}
	// 題に当たった物（当たった全部から、題の列だけで当たる物を選ぶ）
	titled := func(query string, args []any) error {
		res, err := s.db.Query(query, args...)
		if err != nil {
			return err
		}
		defer res.Close()
		for res.Next() {
			var rowid int64
			if err := res.Scan(&rowid); err != nil {
				return err
			}
			if r, ok := rows[rowid]; ok {
				r.inTitle = true
			}
		}
		return res.Err()
	}
	if len(long) > 0 {
		if err := titled(`SELECT rowid FROM search_fts WHERE search_fts MATCH ?`, []any{"{title} : (" + matchExpr(long) + ")"}); err != nil {
			return SearchResult{}, err
		}
	}
	if len(short) > 0 {
		like, likeArgs := likeClause([]string{"title"}, short)
		if err := titled(`SELECT rowid FROM search_fts WHERE `+like, likeArgs); err != nil {
			return SearchResult{}, err
		}
	}

	// 題に当たった物 → 本文だけに当たった物。同じなかでは bm25 の良い順（LIKE だけに当たった物は後ろ）、同順位は新しい順（rowid の大きい順）
	all := make([]*searchRow, 0, len(rows))
	skipped := 0
	for _, r := range rows {
		if q.Keep != nil && !q.Keep(r.kind, r.ref) {
			skipped++
			continue
		}
		all = append(all, r)
	}
	slices.SortFunc(all, func(a, b *searchRow) int {
		switch {
		case a.inTitle != b.inTitle:
			if a.inTitle {
				return -1
			}
			return 1
		case a.rank != b.rank:
			if a.rank < b.rank {
				return -1
			}
			return 1
		case a.rowid != b.rowid:
			if a.rowid > b.rowid {
				return -1
			}
			return 1
		}
		return 0
	})
	out := SearchResult{Total: len(all), Skipped: skipped, Hits: []SearchFound{}}
	from := min(max(q.Offset, 0), len(all))
	to := len(all)
	if q.Limit > 0 {
		to = min(to, from+q.Limit)
	}
	for _, r := range all[from:to] {
		var title, body string
		if err := s.db.QueryRow(`SELECT title, body FROM search_fts WHERE rowid = ?`, r.rowid).Scan(&title, &body); err != nil {
			return SearchResult{}, err
		}
		part, text := partBody, body
		if r.inTitle {
			part, text = partTitle, title
		}
		out.Hits = append(out.Hits, SearchFound{Kind: r.kind, Ref: r.ref, Part: part, Snippet: Snippet(text, terms), Title: title})
	}
	return out, nil
}

// Snippet は、text の、terms のどれかが最初に当たる所の前後 SnippetAround 字を、1 行に切り出す（切った側に … を付ける）。
// 当たる所が見つからない（全角半角などの差で当たった）ときは頭から切る。大文字小文字は区別しない。AI にも画面にも同じものを使う
func Snippet(text string, terms []string) string {
	runes := []rune(strings.Join(strings.Fields(text), " "))
	at, size := -1, 0
	lower := foldRunes(runes)
	for _, t := range terms {
		tr := foldRunes([]rune(t))
		if len(tr) == 0 {
			continue
		}
		if i := indexRunes(lower, tr); i >= 0 && (at < 0 || i < at) {
			at, size = i, len(tr)
		}
	}
	start, end := 0, min(len(runes), 2*SnippetAround)
	if at >= 0 {
		start, end = max(0, at-SnippetAround), min(len(runes), at+size+SnippetAround)
	}
	out := string(runes[start:end])
	if start > 0 {
		out = "…" + out
	}
	if end < len(runes) {
		out += "…"
	}
	return out
}

func foldRunes(r []rune) []rune {
	out := make([]rune, len(r))
	for i, c := range r {
		out[i] = unicode.ToLower(c)
	}
	return out
}

func indexRunes(hay, needle []rune) int {
	for i := 0; i+len(needle) <= len(hay); i++ {
		if slices.Equal(hay[i:i+len(needle)], needle) {
			return i
		}
	}
	return -1
}
