package engine

import (
	"encoding/json"
	"fmt"
)

// CheckAnnotations はステージエントリのアノテーションを今の機能台帳で確かめ、効かないもの（種類が無い・形が合わない）の warning の 1 行ずつを、付いているページの id ごとに返す（データには手を付けない）。
// pairs はステージエントリ（ブックか、ブックの外のページ）とそのアノテーションの並び
func (e *Engine) CheckAnnotations(pairs []Annotated) (out map[string][]string, err error) {
	b, err := json.Marshal(pairs)
	if err != nil {
		return nil, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.notes(string(b))), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// AnnotationsWithout は、アノテーションの並び list から、プラグイン plugin が足した種類のアノテーションを除いた並びと、除いたかを返す
func (e *Engine) AnnotationsWithout(plugin string, list json.RawMessage) (out json.RawMessage, changed bool, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	var got struct {
		Annotations json.RawMessage `json:"annotations"`
		Changed     bool            `json:"changed"`
	}
	if err := json.Unmarshal([]byte(e.without(plugin, string(list))), &got); err != nil {
		return nil, false, err
	}
	return got.Annotations, got.Changed, nil
}

// TalkActions は、利用者トリガートークのときに、アノテーションのあるブックごとに行うアクションの id
func (e *Engine) TalkActions() (ids []string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.talk()), &ids)
	return ids, err
}

// PageMetaKeys は、ページメタのフィールドの名前（core/folders.ts の META_KEYS。ページの中身を持たない窓に、ページの行をページメタだけにして送るのに使う）
func (e *Engine) PageMetaKeys() (keys []string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.metaKeys()), &keys)
	return keys, err
}

// AnnotationsUnexpired は、アノテーションの並び list から、期限（種類の expiresAt。利用者の設定 settings で決まる）が時点 now より前の物を除いた並びと、
// 除いたかを返す。kept の id の物は除かない（利用者が直している物）
func (e *Engine) AnnotationsUnexpired(list, settings json.RawMessage, now string, kept []string) (out json.RawMessage, changed bool, err error) {
	if kept == nil {
		kept = []string{}
	}
	k, err := json.Marshal(kept)
	if err != nil {
		return nil, false, err
	}
	if len(settings) == 0 {
		settings = json.RawMessage("{}")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	var got struct {
		Annotations json.RawMessage `json:"annotations"`
		Changed     bool            `json:"changed"`
	}
	if err := json.Unmarshal([]byte(e.live(string(list), string(settings), now, string(k))), &got); err != nil {
		return nil, false, err
	}
	return got.Annotations, got.Changed, nil
}

// AIAnnotations は、ステージエントリ（ブックか、ブックの外のページ）とそのページごとのアノテーションの組ごとに、AI に見せる並び（アノテーションに、付いているページ page と、
// AI の応えを待っているか awaits を添えたもの。ブックのページの順）を返す。並びは pairs と同じ順
func (e *Engine) AIAnnotations(pairs []Annotated) (out []json.RawMessage, err error) {
	b, err := json.Marshal(pairs)
	if err != nil {
		return nil, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.forAI(string(b))), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// AIBriefs は、ステージエントリ（ブックか、ブックの外のページ）とそのページごとのアノテーションの組ごとに、待っている物を AI に知らせる 1 行（ページの id → アノテーションの id → 1 行。
// 種類が 1 行を持たない物・形の合わない物は入れない）を返す。並びは pairs と同じ順
func (e *Engine) AIBriefs(pairs []Annotated) (out []map[string]map[string]string, err error) {
	b, err := json.Marshal(pairs)
	if err != nil {
		return nil, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.briefs(string(b))), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// Annotated はステージエントリ（ブックか、ブックの外のページ・バインダ）と、そのページごとのアノテーション（ページの id → 並び。CheckAnnotations・AIAnnotations・AIBriefs に渡す）。
// Kind が book なら Book にブックの本文、page なら Page にそのページ、binder なら Pages に中のページを並びの順に入れる（AnnotatedBook・AnnotatedPage・AnnotatedBinder で作る）
type Annotated struct {
	Kind        string                     `json:"kind"`
	Book        json.RawMessage            `json:"book,omitempty"`
	Page        json.RawMessage            `json:"page,omitempty"`
	Pages       []json.RawMessage          `json:"pages,omitempty"`
	Annotations map[string]json.RawMessage `json:"annotations"`
}

// AnnotatedBook は、ブック（本文 book）と、そのページごとのアノテーションの組
func AnnotatedBook(book json.RawMessage, annotations map[string]json.RawMessage) Annotated {
	return Annotated{Kind: "book", Book: book, Annotations: annotations}
}

// AnnotatedPage は、ブックの外のページ page と、そのページのアノテーション（ページの id → 並び）の組
func AnnotatedPage(page json.RawMessage, annotations map[string]json.RawMessage) Annotated {
	return Annotated{Kind: "page", Page: page, Annotations: annotations}
}

// AnnotatedBinder は、ブックの外のバインダの中のページ pages（並びの順）と、そのページごとのアノテーションの組
func AnnotatedBinder(pages []json.RawMessage, annotations map[string]json.RawMessage) Annotated {
	return Annotated{Kind: "binder", Pages: pages, Annotations: annotations}
}
