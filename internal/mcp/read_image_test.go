package mcp

import (
	"testing"
)

// readImageCall は、read_image を page で呼んだ答えの中身（文と、あれば画像）と、失敗したか
func readImageCall(t *testing.T, page string) ([]any, bool) {
	t.Helper()
	got := talk(t, &fakeAPI{}, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_image","arguments":{"page":"`+page+`"}}}`)
	r := got[0]["result"].(map[string]any)
	return r["content"].([]any), r["isError"].(bool)
}

// 画像は、大きさの文のあとに画像で渡す。SVG は文字だけ。画像の無いページと無いページは断り（失敗にしない）
func TestReadImage(t *testing.T) {
	content, failed := readImageCall(t, "img")
	if failed || len(content) != 2 {
		t.Fatalf("image = %v (%v)", content, failed)
	}
	if text := content[0].(map[string]any)["text"]; text != `{"mime":"image/png","width":3000,"height":1500,"sent":{"width":1568,"height":784}}` {
		t.Errorf("text = %v", text)
	}
	if img := content[1].(map[string]any); img["type"] != "image" || img["data"] != "UE5H" || img["mimeType"] != "image/png" {
		t.Errorf("image block = %v", img)
	}
	content, _ = readImageCall(t, "svg")
	if len(content) != 1 || content[0].(map[string]any)["text"] != `{"height":4,"mime":"image/svg+xml","svg":"<svg/>","width":8}` {
		t.Errorf("svg = %v", content)
	}
	for page, want := range map[string]string{"doc": "no-image: the page shows no image", "none": "no-page: there is no page none you can read"} {
		content, failed := readImageCall(t, page)
		if failed || len(content) != 1 || content[0].(map[string]any)["text"] != want {
			t.Errorf("%s = %v (%v)", page, content, failed)
		}
	}
}
