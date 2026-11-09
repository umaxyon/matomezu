package server

// AI がブックを読む口の、ブックの目次とページの範囲。大きいブックを 1 回で返すと MCP の上限を超えるので、ブックはページの目次（id・題名・大きさ）で、
// ページは 1 つの物（子の形ごと）で絞って読める。ここで知るブックの形は、pages（id・title）と、ページの items（id・item）の並びだけ。物を id で探すのは engine（AIItem）が core の探し方で行う。
//
//	GET /api/ai/books/{id}?outline=1                     {"id", "book": ブックの本文のうち pages を [{"id", "title", "size"}] にした物, "version", "annotations"}
//	GET /api/ai/books/{id}/pages/{page}?outline=1        ページの items を [{"id", "item", "size"}] にした物（size は文字数）
//	GET /api/ai/books/{id}/pages/{page}?item=<物の id>   {"id", "page": ページの id, "item": その物（子の形も）, "version", "annotations": その物と子の形に立つもの, "placed": その物と子の形の位置と大きさ}

import "encoding/json"

// sizeOf は JSON にしたときの文字数
func sizeOf(v any) int {
	out, _ := json.Marshal(v)
	return len([]rune(string(out)))
}

// outlineBook は、ブックの本文の pages を、ページごとの id・title・size にした物（ほかの項目はそのまま）
func outlineBook(body json.RawMessage) json.RawMessage {
	var book map[string]any
	if json.Unmarshal(body, &book) != nil {
		return body
	}
	pages, has := book["pages"].([]any)
	if !has {
		return body
	}
	list := []any{}
	for _, p := range pages {
		page, _ := p.(map[string]any)
		list = append(list, map[string]any{"id": page["id"], "title": page["title"], "size": sizeOf(p)})
	}
	book["pages"] = list
	out, _ := json.Marshal(book)
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
