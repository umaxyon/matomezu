package storage

import "encoding/json"

// ブックの本文（並び lineup にページとバインダの中身ごと持つ形）を、フォルダとページの行に分ける決まり。置き場所の移し替え（migrate_books.go）と、
// ブックを丸ごと受け取る所（テストの用意）が使う。分けるのは形だけで、中身は解釈しない。
//
//   - ブックのフォルダ: 本文の lineup を、エントリの id の並び（{"kind": "page" | "binder", "id"}）に替え、"folderRole": "book" を足した物
//   - バインダ: {"folderRole": "binder", "id", "title", "pageType", "lineup": ページの id の並び}（ほかのフィールドがあれば、それも残す）
//   - ページ: エントリの本文そのまま（バイトも変えない）
//
// 分けられないエントリ（kind が page でも binder でもない・id が文字でない・taken の id・lineup が並びでないバインダ）は、フォルダの lineup に中身ごと残す
// （そのブックは、読めないブックになる）。lineup の無いブックは、lineup を足さずにそのままフォルダにする

// Row は、分けた行 1 つ（ページかフォルダ）
type Row struct {
	ID   string
	Body json.RawMessage
}

// Split は、ブックの本文を分けた物。Entries は、エントリの id → それを入れているフォルダの id
type Split struct {
	Folders []Row // 先頭がブックのフォルダ、続けてバインダ（並びの順）
	Pages   []Row // 並びの順（バインダの中のページは、バインダの所に続けて）
	Entries map[string]string
}

// SplitBook は、ブックの本文 body を分ける。taken は、もう使われている id（ほかのブックのページ・フォルダの id）で、分けた id を足す。
// 本文が読めない・id が無い・id が taken にある・lineup が並びでないなら ok は false（分けない）。taken は nil でもよい（そのときは、分けた id を持ち帰らない）
func SplitBook(body json.RawMessage, taken map[string]bool) (split Split, ok bool) {
	if taken == nil {
		taken = map[string]bool{}
	}
	var book map[string]json.RawMessage
	var id string
	if json.Unmarshal(body, &book) != nil || json.Unmarshal(book["id"], &id) != nil || id == "" || taken[id] {
		return Split{}, false
	}
	var lineup []json.RawMessage
	raw, hasLineup := book["lineup"]
	if hasLineup && (json.Unmarshal(raw, &lineup) != nil || lineup == nil) {
		return Split{}, false
	}
	taken[id] = true
	split.Entries = map[string]string{}
	binders := []Row{}
	refs := make([]json.RawMessage, 0, len(lineup))
	for _, e := range lineup {
		kind, entry, fields := headOf(e)
		switch {
		case kind == KindPage && entry != "" && !taken[entry]:
			taken[entry] = true
			split.Pages = append(split.Pages, Row{entry, e})
			split.Entries[entry] = id
			refs = append(refs, refOf(KindPage, entry))
		case kind == KindBinder && entry != "" && !taken[entry] && isList(fields["lineup"]):
			taken[entry] = true
			var inner []json.RawMessage
			_ = json.Unmarshal(fields["lineup"], &inner)
			innerRefs := make([]json.RawMessage, 0, len(inner))
			for _, p := range inner {
				k, page, _ := headOf(p)
				if k == KindPage && page != "" && !taken[page] {
					taken[page] = true
					split.Pages = append(split.Pages, Row{page, p})
					split.Entries[page] = entry
					innerRefs = append(innerRefs, refOf(KindPage, page))
				} else {
					innerRefs = append(innerRefs, p)
				}
			}
			delete(fields, "kind")
			fields["folderRole"] = jsonText(RoleBinder)
			fields["lineup"] = marshal(innerRefs)
			binders = append(binders, Row{entry, marshal(fields)})
			split.Entries[entry] = id
			refs = append(refs, refOf(KindBinder, entry))
		default:
			refs = append(refs, e)
		}
	}
	book["folderRole"] = jsonText(RoleBook)
	if hasLineup {
		book["lineup"] = marshal(refs)
	}
	split.Folders = append([]Row{{id, marshal(book)}}, binders...)
	return split, true
}

// isList は、JSON の値 raw が並び（null でない配列）か
func isList(raw json.RawMessage) bool {
	var list []json.RawMessage
	return raw != nil && json.Unmarshal(raw, &list) == nil && list != nil
}

// headOf は、エントリの kind と id と、全部のフィールド（読めなければ空）
func headOf(entry json.RawMessage) (kind, id string, fields map[string]json.RawMessage) {
	if json.Unmarshal(entry, &fields) != nil {
		return "", "", nil
	}
	_ = json.Unmarshal(fields["kind"], &kind)
	_ = json.Unmarshal(fields["id"], &id)
	return kind, id, fields
}

func refOf(kind, id string) json.RawMessage {
	return marshal(map[string]string{"kind": kind, "id": id})
}

// marshal は JSON にする（文字の表と JSON の値だけを渡すので、失敗しない）
func marshal(v any) json.RawMessage {
	raw, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return raw
}

// jsonText は、文字 s の JSON の値
func jsonText(s string) json.RawMessage { return marshal(s) }
