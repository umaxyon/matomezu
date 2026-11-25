package server

// AI がブックを読む口の、ブックの目次とページの範囲。大きいブックを 1 回で返すと MCP の上限を超えるので、ブックはページの目次（id・題名・タイプ・大きさ）で、
// ページは 1 つの物（子の形ごと）で絞って読める。ここで知るブックの形は、並び（lineup。lineup.go）と、ページの items（id・item）の並びだけ。物を id で探すのは engine（AIItem）が core の探し方で行う。
//
//	GET /api/ai/books/{id}?outline=1                     {"id", "book": ブックの本文のうち lineup のページを {"kind", "id", "title", "type", "size"}にし、参照エントリに指す先の title・type・visible を添えた物, "version", "annotations"}
//	GET /api/ai/pages/{page}?outline=1        ページの items を [{"id", "item", "size"}] にした物（size は文字数）
//	GET /api/ai/pages/{page}?item=<物の id>   {"book", "folder", "page": ページの id, "item": その物（子の形も）, "version", "annotations": その物と子の形に立つもの, "placed": その物と子の形の位置と大きさ}

import (
	"encoding/json"

	"github.com/umaxyon/matomezu/internal/storage"
)

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

// pageID は、ページの行 p の id（読めなければ空）
func pageID(p json.RawMessage) string {
	var head struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(p, &head)
	return head.ID
}

// Referred は、参照エントリの指す先の名前とタイプ（バインダは入れるページのタイプ）と、画面に見えるか（ゴミ箱・読めない物のフォルダの中なら見えない）。指す先が表に無ければ ok が偽
type Referred struct {
	Title   string
	Type    string
	Visible bool
	Pages   []ReferredPage // バインダなら、中のページ（並びの順）
}

// ReferredPage は、参照エントリが指すバインダの中のページ 1 つ（read_page で読む id と名前）
type ReferredPage struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// outlinedReference は、目次の参照エントリ（指す先の id に、指す先の名前・タイプを添え、見えないときは visible を偽にした物）
type outlinedReference struct {
	Kind    string          `json:"kind"`
	ID      string          `json:"id"`
	Of      json.RawMessage `json:"of"`
	Title   string          `json:"title,omitempty"`
	Type    string          `json:"type,omitempty"`
	Visible bool            `json:"visible"`
	Pages   []ReferredPage  `json:"pages,omitempty"`
}

// outlineBook は、ブックの本文の並び（lineup）の、ページを kind・id・title・type・size・version にした物（バインダは kind・id・title・pageType と中の並び。
// 参照エントリは、指す先の名前・タイプと見えるかを添えた物。ほかの項目はそのまま）。version は、ページの id からその版を答え、referred は、参照エントリの指す先を答える
func outlineBook(
	body json.RawMessage,
	version func(page string) int64,
	referred func(kind, id string) (Referred, bool),
) json.RawMessage {
	lineup := lineupOf(body)
	if lineup == nil {
		return body
	}
	outlined, err := mapLineup(lineup, func(p json.RawMessage) (json.RawMessage, error) {
		var page outlinedPage
		_ = json.Unmarshal(p, &page)
		page.Size = len([]rune(string(p)))
		page.Version = version(page.ID)
		return json.Marshal(page)
	}, nil)
	if err != nil {
		return body
	}
	for i, e := range outlined {
		if kindOf(e) == storage.KindReference {
			outlined[i] = outlineReference(e, referred)
		}
	}
	out, err := withLineup(body, outlined)
	if err != nil {
		return body
	}
	return out
}

// outlineReference は、参照エントリ e に指す先の名前・タイプと見えるかを添えた物（形が読めなければ e のまま）
func outlineReference(e json.RawMessage, referred func(kind, id string) (Referred, bool)) json.RawMessage {
	var ref outlinedReference
	var of struct {
		Kind string `json:"kind"`
		ID   string `json:"id"`
	}
	if json.Unmarshal(e, &ref) != nil || json.Unmarshal(ref.Of, &of) != nil {
		return e
	}
	if found, ok := referred(of.Kind, of.ID); ok {
		ref.Title, ref.Type, ref.Visible, ref.Pages = found.Title, found.Type, found.Visible, found.Pages
	}
	out, err := json.Marshal(ref)
	if err != nil {
		return e
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
