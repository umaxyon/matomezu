package engine

import (
	"encoding/json"
	"fmt"
)

// AIPlaced は、ブックのページの id ごとの、形の描いた位置と大きさ（{id, x, y, w, h} の並び。紙の上の左上から）を返す。
// プレゼンテーションが答えないブック・読めないブックなら null（JSON の null）
func (e *Engine) AIPlaced(book json.RawMessage) (out json.RawMessage, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return json.RawMessage(e.placed(string(book))), nil
}

// AIPage は、AI に見せるページ（read_page の page）を返す。背景を持つタイプのページは、背景の形（slide）の図形の情報を見せず、背景の文字だけを background に入れる。
// ほかのページと、読めないブックのページは、渡したまま返す
func (e *Engine) AIPage(book, page json.RawMessage) (out json.RawMessage, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return json.RawMessage(e.aiPage(string(book), string(page))), nil
}

// WarningLines は、窓が見つけて送ってきた warning（{code, plugin, params} の並び）を、warning の表の 1 行ずつにする。
// 表に無い番号・形の合わないものは捨てる（窓が作った文は使わない）
func (e *Engine) WarningLines(warnings json.RawMessage) (out []string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.lines(string(warnings))), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// AISettings は AI が読む設定（MCP 公開ツールの read_settings）: 残した設定 settings から、利用者だけが変える項目と機能台帳に無い項目を除き、
// 値が無いか形に合わない項目は既定にしたもの（項目の id → 値）
func (e *Engine) AISettings(settings json.RawMessage) (out json.RawMessage, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return json.RawMessage(e.settings(string(settings))), nil
}

// AIItem は、ページ（JSON）の中の、どの深さの形も、つなぐものも、id で探した物（item）と、その物と子の形の id の全部（ids）。無ければ found が偽（core の探し方で探す）
func (e *Engine) AIItem(page json.RawMessage, id string) (item json.RawMessage, ids []string, found bool, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	var got *struct {
		Item json.RawMessage `json:"item"`
		IDs  []string        `json:"ids"`
	}
	if err := json.Unmarshal([]byte(e.item(string(page), id)), &got); err != nil {
		return nil, nil, false, err
	}
	if got == nil {
		return nil, nil, false, nil
	}
	return got.Item, got.IDs, true, nil
}
