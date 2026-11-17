package storage

import (
	"database/sql"
	"encoding/json"
)

// annotationsToPages は、ブックごとのアノテーションの並び（表 annotations）を、ページごとの並び（表 page_annotations）へ振り分けて、元の表を捨てる。
// 1 つのアノテーションは、結び付く物の最後（anchors の最後）のあるページに付け、そのページに無い物の id は anchors から外す。
// どのページにも当たらないアノテーション・読めないブックや並びの物は捨てる（結び付く物の無いアノテーションは、残らない決まり）
func annotationsToPages(tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT a.body, b.body, a.updated_at FROM annotations a JOIN books b ON b.id = a.book`)
	if err != nil {
		return err
	}
	type put struct {
		page, updated string
		list          []json.RawMessage
	}
	var puts []put
	for rows.Next() {
		var list, book, updated string
		if err := rows.Scan(&list, &book, &updated); err != nil {
			rows.Close()
			return err
		}
		pages := pageIDsOf(json.RawMessage(book))
		byPage := map[string][]json.RawMessage{}
		var order []string
		var annotations []map[string]json.RawMessage
		if json.Unmarshal([]byte(list), &annotations) != nil {
			continue
		}
		for _, a := range annotations {
			var anchors []string
			if json.Unmarshal(a["anchors"], &anchors) != nil || len(anchors) == 0 {
				continue
			}
			page := ""
			for _, p := range pages {
				if p.ids[anchors[len(anchors)-1]] {
					page = p.id
					kept := []string{}
					for _, id := range anchors {
						if p.ids[id] {
							kept = append(kept, id)
						}
					}
					raw, err := json.Marshal(kept)
					if err != nil {
						rows.Close()
						return err
					}
					a["anchors"] = raw
					break
				}
			}
			if page == "" {
				continue
			}
			raw, err := json.Marshal(a)
			if err != nil {
				rows.Close()
				return err
			}
			if _, ok := byPage[page]; !ok {
				order = append(order, page)
			}
			byPage[page] = append(byPage[page], raw)
		}
		for _, page := range order {
			puts = append(puts, put{page, updated, byPage[page]})
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, p := range puts {
		body, err := json.Marshal(p.list)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT OR REPLACE INTO page_annotations (page, body, updated_at) VALUES (?, ?, ?)`, p.page, string(body), p.updated); err != nil {
			return err
		}
	}
	_, err = tx.Exec(`DROP TABLE annotations`)
	return err
}

// pageIDs は、ページ 1 枚の id と、その中の物の id（どの深さのオブジェクトの、文字列のフィールド id。ページそのものの id は入れない）
type pageIDs struct {
	id  string
	ids map[string]bool
}

// pageIDsOf は、ブックの本文の並び（lineup）のページ（バインダの中も）ごとの pageIDs
func pageIDsOf(book json.RawMessage) []pageIDs {
	var b struct {
		Lineup []json.RawMessage `json:"lineup"`
	}
	if json.Unmarshal(book, &b) != nil {
		return nil
	}
	var out []pageIDs
	var walk func(entries []json.RawMessage)
	walk = func(entries []json.RawMessage) {
		for _, e := range entries {
			var head struct {
				Kind   string            `json:"kind"`
				ID     string            `json:"id"`
				Lineup []json.RawMessage `json:"lineup"`
			}
			if json.Unmarshal(e, &head) != nil {
				continue
			}
			if head.Kind == "binder" {
				walk(head.Lineup)
				continue
			}
			var fields map[string]any
			if head.Kind != "page" || head.ID == "" || json.Unmarshal(e, &fields) != nil {
				continue
			}
			delete(fields, "id")
			ids := map[string]bool{}
			collectIDs(fields, ids)
			out = append(out, pageIDs{head.ID, ids})
		}
	}
	walk(b.Lineup)
	return out
}

// collectIDs は、値 v の中の、どの深さのオブジェクトの id（文字列のフィールド id）も into に集める
func collectIDs(v any, into map[string]bool) {
	switch x := v.(type) {
	case []any:
		for _, e := range x {
			collectIDs(e, into)
		}
	case map[string]any:
		for k, e := range x {
			if id, ok := e.(string); ok && k == "id" {
				into[id] = true
			} else if k != "id" {
				collectIDs(e, into)
			}
		}
	}
}
