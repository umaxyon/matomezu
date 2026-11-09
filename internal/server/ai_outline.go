package server

// AI がブックを読む口の、目次と範囲。大きいブックを 1 回で返すと MCP の上限を超えるので、ブックは目次（ページの id・題名・大きさ）で、
// ページは 1 つの物（その中の物ごと）で絞って読める。ブックの形は、pages（id・title）と、ページの items（id・item）の並びだけを知っていて、ほかは見ない。
//
//	GET /api/ai/books/{id}?outline=1                     {"id", "book": ブックの本文のうち pages を [{"id", "title", "size"}] にした物, "version", "annotations"}
//	GET /api/ai/books/{id}/pages/{page}?outline=1        ページの items を [{"id", "item", "size"}] にした物（size は文字数）
//	GET /api/ai/books/{id}/pages/{page}?item=<物の id>   {"id", "page": ページの id, "item": その物（中の物も）, "version", "annotations": その物と中の物に立つもの, "placed": その物と中の物の位置と大きさ}

import (
	"encoding/json"
	"slices"
)

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
	pages, _ := book["pages"].([]any)
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

// findItem は、ページの中（中の物も）の、id が want の物と、その物と中の物の id の全部
func findItem(page json.RawMessage, want string) (found map[string]any, ids []string) {
	var p map[string]any
	if json.Unmarshal(page, &p) != nil {
		return nil, nil
	}
	var walk func(v any) map[string]any
	walk = func(v any) map[string]any {
		switch x := v.(type) {
		case map[string]any:
			if id, _ := x["id"].(string); id == want && x["item"] != nil {
				return x
			}
			for _, child := range x {
				if hit := walk(child); hit != nil {
					return hit
				}
			}
		case []any:
			for _, child := range x {
				if hit := walk(child); hit != nil {
					return hit
				}
			}
		}
		return nil
	}
	found = walk(p["items"])
	if found == nil {
		return nil, nil
	}
	var collect func(v any)
	collect = func(v any) {
		switch x := v.(type) {
		case map[string]any:
			if id, _ := x["id"].(string); id != "" && x["item"] != nil {
				ids = append(ids, id)
			}
			for _, child := range x {
				collect(child)
			}
		case []any:
			for _, child := range x {
				collect(child)
			}
		}
	}
	collect(found)
	slices.Sort(ids)
	return found, ids
}
