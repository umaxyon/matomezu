package mcp

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// importImageCall は、import_image を args で呼んだ答えの文と、失敗したか
func importImageCall(t *testing.T, api *fakeAPI, args string) (string, bool) {
	t.Helper()
	got := talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"import_image","arguments":`+args+`}}`)
	r := got[0]["result"].(map[string]any)
	return r["content"].([]any)[0].(map[string]any)["text"].(string), r["isError"].(bool)
}

func TestImportImageSendsTheFileOrTheSVGAsBytes(t *testing.T) {
	file := filepath.Join(t.TempDir(), "a.png")
	if err := os.WriteFile(file, []byte("PNGBYTES"), 0o600); err != nil {
		t.Fatal(err)
	}
	api := &fakeAPI{answer: `{"ok":true,"asset":"` + strings.Repeat("a", 64) + `","mime":"image/png","width":4,"height":3}`}
	pathArg, _ := json.Marshal(map[string]string{"path": file})
	text, failed := importImageCall(t, api, string(pathArg))
	if failed || text != `{"asset":"`+strings.Repeat("a", 64)+`","height":3,"mime":"image/png","width":4}` {
		t.Fatalf("answer = %s (%v)", text, failed)
	}
	if _, _ = importImageCall(t, api, `{"svg":"<svg/>"}`); len(api.posts) != 2 {
		t.Fatalf("posted = %v", api.posts)
	}
	for i, body := range []string{"PNGBYTES", "<svg/>"} {
		if want := `api/ai/assets "` + base64.StdEncoding.EncodeToString([]byte(body)) + `"`; api.posts[i] != want {
			t.Errorf("post %d = %s; want %s", i, api.posts[i], want)
		}
	}
}

func TestImportImageRefusals(t *testing.T) {
	big := filepath.Join(t.TempDir(), "big.png")
	f, err := os.Create(big)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(26 << 20); err != nil {
		t.Fatal(err)
	}
	f.Close()
	quoted := func(p string) string { b, _ := json.Marshal(p); return string(b) }
	for args, want := range map[string]string{
		`{}`:                                   "bad-args: give path or svg",
		`{"path":"a","svg":"<svg/>"}`:          "bad-args: give path or svg",
		`{"path":` + quoted(big) + `}`:         "too-large:",
		`{"path":` + quoted(big+".none") + `}`: "cannot-read:",
		`{"path":` + quoted(t.TempDir()) + `}`: "cannot-read:",
	} {
		api := &fakeAPI{}
		if text, failed := importImageCall(t, api, args); failed || !strings.HasPrefix(text, want) || len(api.posts) != 0 {
			t.Errorf("%s = %s (%v), posted %v; want %s", args, text, failed, api.posts, want)
		}
	}
	for answer, want := range map[string]string{
		`{"ok":false,"reason":"too-large"}`: "too-large:",
		`{"ok":false,"reason":"not-image"}`: "not-image:",
		`{"ok":false,"reason":"not-joined","detail":"call join first"}`: "not-joined: call join first",
	} {
		if text, failed := importImageCall(t, &fakeAPI{answer: answer}, `{"svg":"x"}`); failed || !strings.HasPrefix(text, want) {
			t.Errorf("%s = %s (%v)", answer, text, failed)
		}
	}
}
