package server

// AI がブックを読む口の、ブックの目次とページの範囲。大きいブックを 1 回で返すと MCP の上限を超えるので、ブックはページの目次（id・題名・タイプ・大きさ）で、
// ページは 1 つの物（子の形ごと）で絞って読める。ここで知るブックの形は、並び（lineup。lineup.go）と、ページの items（id・item）の並びだけ。物を id で探すのは engine（AIItem）が core の探し方で行う。
//
//	GET /api/ai/books/{id}?outline=1                     {"id", "book": ブックの本文のうち lineup のページを {"kind", "id", "title", "type", "size"}（読めないページは {"kind": "unreadable", "id", "title", "code"}）にした物, "version", "annotations"}
//	GET /api/ai/pages/{page}?outline=1        ページの items を [{"id", "item", "size"}] にした物（size は文字数）
//	GET /api/ai/pages/{page}?item=<物の id>   {"book", "page": ページの id, "item": その物（子の形も）, "version", "annotations": その物と子の形に立つもの, "placed": その物と子の形の位置と大きさ}

import "encoding/json"

// sizeOf は JSON にしたときの文字数
func sizeOf(v any) int {
	out, _ := json.Marshal(v)
	return len([]rune(string(out)))
}

// outlinedPage は、目次のページ（エントリの形のまま、中身の代わりに大きさと、そのページの版）
type outlinedPage struct {
	Kind    string `json:"kind"`
	ID      string `json:"id"`
	Title   string `json:"title"`
	Type    string `json:"type"`
	Size    int    `json:"size"`
	Version int64  `json:"version"`
}

// unreadableEntry は、読めないページ（保存してある行 p）の、AI に見せる並びの要素: kind unreadable・id・title（行の題名が文字列でなければ空）・code（読めない理由の warning の番号）。
// 中身も理由の文も見せない
func unreadableEntry(p json.RawMessage, code string) (json.RawMessage, error) {
	var row map[string]json.RawMessage
	_ = json.Unmarshal(p, &row)
	var id, title, kind string
	_ = json.Unmarshal(row["id"], &id)
	_ = json.Unmarshal(row["title"], &title)
	_ = json.Unmarshal(row["type"], &kind)
	return json.Marshal(struct {
		Kind  string `json:"kind"`
		ID    string `json:"id"`
		Title string `json:"title"`
		Code  string `json:"code"`
		Type  string `json:"type,omitempty"`
	}{"unreadable", id, title, code, kind})
}

// unreadableOf は、ページの id から、読めないページならその理由の warning の番号を答える（Hub.UnreadablePage）
type unreadableOf func(page string) (code string, ok bool)

// pageID は、ページの行 p の id（読めなければ空）
func pageID(p json.RawMessage) string {
	var head struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(p, &head)
	return head.ID
}

// outlineBook は、ブックの本文の並び（lineup）の、ページを kind・id・title・type・size・version にした物（バインダは kind・id・title・pageType と中の並び。ほかの項目はそのまま）。
// version は、ページの id からその版を答える。読めないページは unreadableEntry にする
func outlineBook(body json.RawMessage, version func(page string) int64, unreadable unreadableOf) json.RawMessage {
	lineup := lineupOf(body)
	if lineup == nil {
		return body
	}
	outlined, err := mapLineup(lineup, func(p json.RawMessage) (json.RawMessage, error) {
		if code, ok := unreadable(pageID(p)); ok {
			return unreadableEntry(p, code)
		}
		var page outlinedPage
		_ = json.Unmarshal(p, &page)
		page.Size = len([]rune(string(p)))
		page.Version = version(page.ID)
		return json.Marshal(page)
	}, nil)
	if err != nil {
		return body
	}
	out, err := withLineup(body, outlined)
	if err != nil {
		return body
	}
	return out
}

// outlinePage は、ページの items を、物ごとの id・item・size にした物（ほかの項目はそのまま）
func outlinePage(page json.RawMessage) json.RawMessage {
	var p map[string]any
	if json.Unmarshal(page, &p) != nil {
		return page
	}
	items, _ := p["items"].([]any)
	list := []any{}
	for _, it := range items {
		item, _ := it.(map[string]any)
		list = append(list, map[string]any{"id": item["id"], "item": item["item"], "size": sizeOf(it)})
	}
	if _, has := p["items"]; has {
		p["items"] = list
	}
	out, _ := json.Marshal(p)
	return out
}
