package engine

import (
	"encoding/json"
	"fmt"
)

// BookWarning は warning のあるステージエントリ（ブックか、ブックの外のページ）: その id・warning の番号・warning の 1 行と、ブックごと読めないか（エンジンが決める。
// ブックごと読めない W005 形に合わない・W006 決まりを守らない・読めないページを持つ W027〜W029、読めるが機能台帳に無い物を持つ W007 など。1 冊に 1 つ）
type BookWarning struct {
	Entry      string `json:"entry"`
	Code       string `json:"code"`
	Warning    string `json:"warning"`
	Unreadable bool   `json:"unreadable"`
}

// CheckBooks はブックを今の機能台帳で確かめ、warning のあるものを返す（データには手を付けない）
func (e *Engine) CheckBooks(books []json.RawMessage) ([]BookWarning, error) {
	return e.entryWarnings(books, func(s string) string { return e.check(s) })
}

// CheckOutsidePages はブックの外のページを今の機能台帳で確かめ、読めるが機能台帳に無い物を持つページの warning（W007）を返す（データには手を付けない）
func (e *Engine) CheckOutsidePages(pages []json.RawMessage) ([]BookWarning, error) {
	return e.entryWarnings(pages, func(s string) string { return e.checkOutside(s) })
}

// entryWarnings は、本文の並び bodies をエンジンの確かめ check に渡し、warning のあるステージエントリを返す
func (e *Engine) entryWarnings(bodies []json.RawMessage, check func(string) string) (out []BookWarning, err error) {
	b, err := json.Marshal(bodies)
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
	if err := json.Unmarshal([]byte(check(string(b))), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// CheckLibrary は、フォルダの行の全部（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ）とページの行の id の全部 pages が木の決まりを守るかを確かめ、破れていれば warning（W030）の 1 行を、守っていれば空の文字列を返す
// （データには手を付けない）
func (e *Engine) CheckLibrary(folders []json.RawMessage, pages []string) (line string, err error) {
	b, err := json.Marshal(folders)
	if err != nil {
		return "", err
	}
	// ページが 1 枚も無いときも、空の並びとして渡す（nil のままだと JSON の null になる）
	ids, err := json.Marshal(append([]string{}, pages...))
	if err != nil {
		return "", err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return e.checkTree(string(b), string(ids)), nil
}

// SystemFolderTitles は、今の機能台帳のシステムフォルダの定義の id → AI に見せる名前（英語）
func (e *Engine) SystemFolderTitles() (titles map[string]string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.sysFolders()), &titles)
	return titles, err
}

// Moved は、読めない物のフォルダへ移した物 1 つ（id と、理由の warning の番号と、無いタイプ。タイプは W027 のときだけ）
type Moved struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Type string `json:"type,omitempty"`
}

// Numbered は、名前が重なって番号を付けた物 1 つ（id と、付けた名前）
type Numbered struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// Added は、書庫を整えて足したシステムフォルダ 1 つ: 行の id と印（定義の id）
type Added struct {
	ID           string `json:"id"`
	SystemFolder string `json:"systemFolder"`
}

// Settled は、書庫を整えた結果: 書く行の変わり（Pages・Folders）と、移した物・戻した物の id・足したシステムフォルダ・名前に番号を付けた物と、
// そのあとの warning W032 の 1 行（読めない物が無ければ空）。Broken なら、読めない物のフォルダの行が形に合わないか、足すシステムフォルダの id が振れず、何も書かない
type Settled struct {
	Broken   bool        `json:"broken,omitempty"`
	Pages    []RowChange `json:"pages,omitempty"`
	Folders  []RowChange `json:"folders,omitempty"`
	Moved    []Moved     `json:"moved,omitempty"`
	Returned []string    `json:"returned,omitempty"`
	Added    []Added     `json:"added,omitempty"`
	Numbered []Numbered  `json:"numbered,omitempty"`
	Warning  string      `json:"warning,omitempty"`
}

// SettleLibrary は、置き場所の行の全部（pages・folders）で、書庫を今の機能台帳に合わせて整える行の変わり: 読めない物を読めない物のフォルダへ移し、読めるようになった物を在った所へ戻し、
// 足りないシステムフォルダを足して、名前の重なりに番号を付ける
// （名前は利用者の設定 settings の言語で比べる。移した時刻は now。core/unreadable.ts の settleLibrary）
func (e *Engine) SettleLibrary(pages, folders []json.RawMessage, settings json.RawMessage, now string) (out Settled, err error) {
	p, err := json.Marshal(append([]json.RawMessage{}, pages...))
	if err != nil {
		return out, err
	}
	f, err := json.Marshal(append([]json.RawMessage{}, folders...))
	if err != nil {
		return out, err
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
	err = json.Unmarshal([]byte(e.settle(string(p), string(f), string(settings), now)), &out)
	return out, err
}

// SettleFailed は、書庫を整えるのに失敗した訳 reason（"engine"・"broken"・"write"）の warning W033 の 1 行
func (e *Engine) SettleFailed(reason string) (line string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return e.settleFail(reason), nil
}

// MovedIfOff は、利用者の設定 settings で無効の追加プラグインに加えて ids も無効にしたら、読めない物のフォルダへ移る物（移す順。書かない）。
// 今の組は替えずに別に組み、SettleLibrary と同じ決め方で決める。broken なら、読めない物のフォルダの行が形に合わない（何も移らない）
func (e *Engine) MovedIfOff(ids []string, pages, folders []json.RawMessage, settings json.RawMessage, now string) (moved []MovedUnit, broken bool, err error) {
	if ids == nil {
		ids = []string{}
	}
	i, err := json.Marshal(ids)
	if err != nil {
		return nil, false, err
	}
	p, err := json.Marshal(append([]json.RawMessage{}, pages...))
	if err != nil {
		return nil, false, err
	}
	f, err := json.Marshal(append([]json.RawMessage{}, folders...))
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
		Broken bool        `json:"broken"`
		Moved  []MovedUnit `json:"moved"`
	}
	if err = json.Unmarshal([]byte(e.movedIfOff(string(i), string(p), string(f), string(settings), now)), &got); err != nil {
		return nil, false, err
	}
	return got.Moved, got.Broken, nil
}

// MovedUnit は、読めない物のフォルダへ移る物 1 つ: エントリの種類と id、在った所 Holder（それを並びに持つフォルダの id）、訳の番号、無いタイプ（W027 のとき）
type MovedUnit struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Holder string `json:"holder"`
	Code   string `json:"code"`
	Type   string `json:"type,omitempty"`
}

// PurgedRows は、読めない物のフォルダの直下の物 id を完全に消す行の変わり（その中の物の行も。ほかのフォルダも持つ行は消さない）と、そのあとの warning W032 の 1 行。
// 直下に無ければ found が false（core/unreadable.ts の purgedRows）
func (e *Engine) PurgedRows(pages, folders []json.RawMessage, id string) (out Settled, found bool, err error) {
	p, err := json.Marshal(append([]json.RawMessage{}, pages...))
	if err != nil {
		return out, false, err
	}
	f, err := json.Marshal(append([]json.RawMessage{}, folders...))
	if err != nil {
		return out, false, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	var got struct {
		Settled
		None bool `json:"none"`
	}
	if err = json.Unmarshal([]byte(e.purge(string(p), string(f), id)), &got); err != nil {
		return out, false, err
	}
	return got.Settled, !got.None, nil
}
