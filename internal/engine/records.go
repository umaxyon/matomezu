package engine

import (
	"encoding/json"
	"fmt"
)

// SearchText は、レコード 1 件の、横断検索に使う文字（題と本文。どちらも空でありうる）
type SearchText struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

// KeySpec は索引キー 1 つの宣言（名前と、値の型 text か number）、Kind はレコードの種類 1 つとその索引キーの宣言
type KeySpec struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type Kind struct {
	Subject string    `json:"subject"`
	Keys    []KeySpec `json:"keys"`
	Search  bool      `json:"search"`           // 横断検索できる種類か（searchTexts を書いた種類）
	AI      bool      `json:"ai"`               // AI に見せる種類か（read_records）
	AIList  *AIList   `json:"aiList,omitempty"` // 一覧の既定の並びと件数（索引キーで探す種類だけ）
	// 一覧の既定の目次に載せない物がある種類の、載せない物の説明（read_records の unlisted を受ける種類）
	AIUnlisted string `json:"aiUnlisted,omitempty"`
}

// AIList は、AI に見せる一覧の既定の並び（索引キー Key の asc か desc）と件数
type AIList struct {
	Order struct {
		Key string `json:"key"`
		Dir string `json:"dir"`
	} `json:"order"`
	Limit int `json:"limit"`
}

// Kinds は、今の機能台帳のレコードの種類と、索引キーの宣言
func (e *Engine) Kinds() (kinds []Kind, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.kinds()), &kinds)
	return kinds, err
}

// AIRows は、AI に見せる種類 kind のレコードの並び records の、一覧の行（受けた順のまま。id・種類が添えるフィールド・題 brief）。AI に見せない種類なら ok が false。
// 題が引く指す先のレコードは src から引く（呼ぶ側が置き場所を止めておく）
func (e *Engine) AIRows(kind string, records []json.RawMessage, src Source) (rows []json.RawMessage, ok bool, err error) {
	b, err := json.Marshal(records)
	if err != nil {
		return nil, false, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.source = src
	defer func() { e.source = nil }()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	out := e.aiRows(kind, string(b))
	if out == "null" {
		return nil, false, nil
	}
	err = json.Unmarshal([]byte(out), &rows)
	return rows, err == nil, err
}

// KeysOf は、種類 subject のレコード records（id → レコード）の索引キーの値（id → 名前 → 値）
func (e *Engine) KeysOf(subject string, records map[string]json.RawMessage) (keys map[string]map[string]any, err error) {
	b, err := json.Marshal(records)
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
	err = json.Unmarshal([]byte(e.keysOf(subject, string(b))), &keys)
	return keys, err
}

// SearchTextsOf は、種類 subject のレコード records（id → レコード）の、横断検索に使う文字（id → 題と本文）。形に合わないレコードは含めない
func (e *Engine) SearchTextsOf(subject string, records map[string]json.RawMessage) (texts map[string]SearchText, err error) {
	b, err := json.Marshal(records)
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
	err = json.Unmarshal([]byte(e.searchOf(subject, string(b))), &texts)
	return texts, err
}

// Ref は、レコード 1 件の指す先（種類の id と id）
type Ref struct {
	Kind string `json:"subject"`
	ID   string `json:"id"`
}

// ParentsOf は、種類 subject のレコード records（id → レコード）の親（定義の refers の先頭 1 件。id → 指す先）。refers を書かない種類や、指す先の無いレコードは含めない
func (e *Engine) ParentsOf(subject string, records map[string]json.RawMessage) (parents map[string]Ref, err error) {
	b, err := json.Marshal(records)
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
	err = json.Unmarshal([]byte(e.parentsOf(subject, string(b))), &parents)
	return parents, err
}

// UnlistedOf は、種類 subject のレコード records（id → レコード）のうち、一覧の既定の目次に載せない物の id（aiListed を書かない種類は、載せない物が無い）。
// 指す先のレコードは src から引く（呼ぶ側が置き場所を止めておく）
func (e *Engine) UnlistedOf(subject string, records map[string]json.RawMessage, src Source) (ids []string, err error) {
	b, err := json.Marshal(records)
	if err != nil {
		return nil, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.source = src
	defer func() { e.source = nil }()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.unlisted(subject, string(b))), &ids)
	return ids, err
}

// CheckRecords はレコード（種類の id → id → レコード）を今の機能台帳で確かめ、効かないレコード（種類が無い・形が合わない）の warning の 1 行ずつを返す（データには手を付けない）
func (e *Engine) CheckRecords(records map[string]map[string]json.RawMessage) (out []string, err error) {
	body, err := json.Marshal(records)
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
	err = json.Unmarshal([]byte(e.records(string(body))), &out)
	return out, err
}

// SubjectRoles は、常駐が読む種類の役（participants・workrooms）ごとの、対象の定義の id（役を名乗る定義が無ければ入らない）
func (e *Engine) SubjectRoles() (roles map[string]string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.roles()), &roles)
	return roles, err
}

// RecordBrief は、AI に見せるレコードの一覧の 1 行
type RecordBrief struct {
	ID    string `json:"id"`
	Brief string `json:"brief"`
}

// AIRecords は、AI に見せる種類 kind のレコードの一覧（トップの項目が where の値と同じ物のうち、unlisted の hide は目次に載せる物だけ・include は全部・only は載せない物だけ。
// 種類が決めた並び）と、hide のときの載せなかった数を返す。指す先のレコードは src から引く（呼ぶ側が置き場所を止めておく）。AI に見せない種類・無い種類は ok が false
func (e *Engine) AIRecords(kind string, records []json.RawMessage, where map[string]string, unlisted string, src Source) (rows []RecordBrief, hidden int, ok bool, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.source = src
	defer func() { e.source = nil }()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	in, err := json.Marshal(records)
	if err != nil {
		return nil, 0, false, err
	}
	w, err := json.Marshal(where)
	if err != nil {
		return nil, 0, false, err
	}
	out := e.aiRecords(kind, string(in), string(w), unlisted)
	if out == "null" {
		return nil, 0, false, nil
	}
	var listed struct {
		Rows     []RecordBrief `json:"rows"`
		Unlisted int           `json:"unlisted"`
	}
	err = json.Unmarshal([]byte(out), &listed)
	return listed.Rows, listed.Unlisted, err == nil, err
}

// BackyardBook は、AI に見せるバックヤードの中の、レコードの物のブック 1 冊（read_records の全文に添える）: バックヤードの印、ブックの id、中のページの数
type BackyardBook struct {
	Backyard string `json:"backyard"`
	Book     string `json:"book"`
	Pages    int    `json:"pages"`
}

// RecordBooks は、種類 kind のレコード ids のうち、AI に見せるバックヤード（base の tickets-history など。定義が名乗る）にブックが在る物の id → そのブックの並び。
// folders は書庫のフォルダの行の全部
func (e *Engine) RecordBooks(kind string, ids []string, folders []json.RawMessage) (out map[string][]BackyardBook, err error) {
	in, err := json.Marshal(ids)
	if err != nil {
		return nil, err
	}
	f, err := json.Marshal(append([]json.RawMessage{}, folders...))
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
	err = json.Unmarshal([]byte(e.recordBooks(kind, string(in), string(f))), &out)
	return out, err
}
