package server

import (
	"strings"
	"testing"
)

// 吹き出しかドロワーかは文字の量で決まる（全角 1・半角 0.5）。2 つ以上なら A, B…。id は書かなければ連番（D36。ask.go）
func TestPrepareDecidesTheView(t *testing.T) {
	items, err := prepare([]AskItem{
		{Box: "1", Text: "１２３４５６７８９０１２３４５６７８９０", Choices: []string{"はい", "いいえ"}}, // 20 文字・ボタンの合計 5
		{Box: "2", Text: strings.Repeat("a", 40)},                        // 半角 40 = 20
		{Box: "3", Text: "１２３４５６７８９０１２３４５６７８９０１"},                        // 21 文字
		{Box: "4", Choices: []string{"了承する", "やめる"}},                     // ボタンの合計 7
		{Box: "5", Choices: []string{"A", "B", "C"}},                     // ボタン 3 つ
		{Box: "6", Text: "選ぶ", Choices: []string{"x", "y"}, Multi: true}, // 複数選択
		{ID: "own", Box: "7", Text: "書いて", Input: true},                  // 文字の入力
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"bubble", "bubble", "drawer", "drawer", "drawer", "drawer", "drawer"}
	for i, it := range items {
		if it.View != want[i] {
			t.Errorf("item %d: %s, want %s", i+1, it.View, want[i])
		}
		if it.Letter != string(rune('A'+i)) || it.State != "open" {
			t.Errorf("item %d: letter %q state %q", i+1, it.Letter, it.State)
		}
	}
	if items[0].ID != "1" || items[6].ID != "own" {
		t.Errorf("ids: %q %q", items[0].ID, items[6].ID)
	}
	one, _ := prepare([]AskItem{{Box: "1", Text: "x"}})
	if one[0].Letter != "" {
		t.Errorf("a single item has no letter: %q", one[0].Letter)
	}
	for _, bad := range [][]AskItem{
		nil,
		{{Text: "no box"}},
		{{Box: "1"}},
		{{Box: "1", Text: "x"}, {ID: "1", Box: "2", Text: "y"}},
		{{Box: "1", Text: strings.Repeat("長", 151)}},
		{{Box: "1", Choices: []string{"x"}, Multi: true}},
		{{Box: "1", Choices: []string{" "}}},
	} {
		if _, err := prepare(bad); err == nil {
			t.Errorf("accepted %+v", bad)
		}
	}
}
