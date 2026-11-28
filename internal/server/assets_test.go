package server

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

func rasterBytes(t *testing.T, kind string, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	img.Set(0, 0, color.RGBA{255, 0, 0, 255})
	var b bytes.Buffer
	var err error
	switch kind {
	case "png":
		err = png.Encode(&b, img)
	case "jpeg":
		err = jpeg.Encode(&b, img, nil)
	case "gif":
		err = gif.Encode(&b, img, nil)
	}
	if err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// webpLossless は、幅 w・高さ h の VP8L の頭だけの WebP（中身は読まないので頭だけで足りる）
func webpLossless(w, h int) []byte {
	bits := uint32(w-1) | uint32(h-1)<<14
	data := []byte{0x2f, byte(bits), byte(bits >> 8), byte(bits >> 16), byte(bits >> 24), 0, 0, 0, 0, 0}
	chunk := append([]byte("VP8L"), byte(len(data)), 0, 0, 0)
	body := append([]byte("WEBP"), append(chunk, data...)...)
	return append(append([]byte("RIFF"), byte(len(body)), 0, 0, 0), body...)
}

func postAsset(t *testing.T, url string, body []byte) map[string]any {
	t.Helper()
	req, _ := http.NewRequest("POST", url+"/api/assets", bytes.NewReader(body))
	req.Header.Set("Cookie", testCookie(url))
	req.Header.Set("Content-Type", "application/octet-stream")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	out := map[string]any{}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatalf("status %d: %v", res.StatusCode, err)
	}
	return out
}

func TestImportAssetKinds(t *testing.T) {
	t.Parallel()
	_, s := hubAt(t, filepath.Join(t.TempDir(), "data.db"))
	for _, c := range []struct {
		name string
		body []byte
		mime string
		w, h float64
	}{
		{"png", rasterBytes(t, "png", 40, 30), "image/png", 40, 30},
		{"jpeg", rasterBytes(t, "jpeg", 20, 50), "image/jpeg", 20, 50},
		{"gif", rasterBytes(t, "gif", 8, 8), "image/gif", 8, 8},
		{"webp", webpLossless(300, 200), "image/webp", 300, 200},
		{"svg with width and height", []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="60"/>`), "image/svg+xml", 120, 60},
		{"svg with viewBox", []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"></svg>`), "image/svg+xml", 64, 32},
		{"svg with neither", []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`), "image/svg+xml", 300, 150},
	} {
		got := postAsset(t, s.URL, c.body)
		if got["ok"] != true || got["mime"] != c.mime || got["width"] != c.w || got["height"] != c.h || len(got["asset"].(string)) != 64 {
			t.Errorf("%s: %v", c.name, got)
		}
	}
	for name, body := range map[string][]byte{
		"text":                          []byte("hello"),
		"html":                          []byte("<html><body>x</body></html>"),
		"svg not as root":               []byte(`<g xmlns="http://www.w3.org/2000/svg"><svg/></g>`),
		"broken png":                    []byte("\x89PNG\r\n\x1a\nbroken"),
		"broken svg":                    []byte(`<svg xmlns="http://www.w3.org/2000/svg"><g></svg>`),
		"style that loads from outside": []byte(`<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(http://x/a.css);</style></svg>`),
	} {
		if got := postAsset(t, s.URL, body); got["ok"] != false || got["reason"] != assetNotImage {
			t.Errorf("%s: %v", name, got)
		}
	}
	big := append(rasterBytes(t, "png", 2, 2), make([]byte, maxAsset)...)
	if got := postAsset(t, s.URL, big); got["ok"] != false || got["reason"] != assetTooLarge {
		t.Errorf("too large: %v", got)
	}
}

func TestImportAssetSameContentSameID(t *testing.T) {
	t.Parallel()
	h, s := hubAt(t, filepath.Join(t.TempDir(), "data.db"))
	b := rasterBytes(t, "png", 4, 4)
	first, second := postAsset(t, s.URL, b), postAsset(t, s.URL, b)
	if first["asset"] != second["asset"] {
		t.Fatalf("ids differ: %v %v", first, second)
	}
	ids, err := h.store.AssetIDs()
	if err != nil || len(ids) != 1 {
		t.Fatalf("assets = %v, %v", ids, err)
	}
}

func TestCleanSVG(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, in, want string }{
		{"script", `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1"/></svg>`,
			`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="1"></rect></svg>`},
		{"event attributes", `<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><circle r="2" onclick="y()"/></svg>`,
			`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><circle r="2"></circle></svg>`},
		{"foreignObject and its contents", `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>`,
			`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>`},
		{"animation that rewrites href", `<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" to="javascript:x()"/></a></svg>`,
			`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>`},
		{"outside href", `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="http://x/a.svg#b"/><use href="#c"/></svg>`,
			`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use></use><use href="#c"></use></svg>`},
		{"image element", `<svg xmlns="http://www.w3.org/2000/svg"><image href="http://x/a.png"/></svg>`,
			`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>`},
		{"url to outside in an attribute", `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(http://x/#g)" stroke="url(#g)"/></svg>`,
			`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect stroke="url(#g)"></rect></svg>`},
		{"style attribute loading from outside", `<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url('http://x/a')"/><rect style="fill:red"/></svg>`,
			`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect></rect><rect style="fill:red"></rect></svg>`},
		{"text, comments and doctype", `<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"><!-- c --><text x="1">a &amp; url(b)</text></svg>`,
			`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><text x="1">a &amp; url(b)</text></svg>`},
	} {
		out, _, _, ok := cleanSVG([]byte(c.in))
		if !ok || string(out) != c.want {
			t.Errorf("%s:\n got %s (%v)\nwant %s", c.name, out, ok, c.want)
		}
	}
}

func TestServeAsset(t *testing.T) {
	t.Parallel()
	_, s := hubAt(t, filepath.Join(t.TempDir(), "data.db"))
	svg := postAsset(t, s.URL, []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><script>x()</script></svg>`))
	get := func(id, cookie string) *http.Response {
		req, _ := http.NewRequest("GET", s.URL+"/api/assets/"+id, nil)
		req.Header.Set("Cookie", cookie)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		cleanup(t, func() { res.Body.Close() })
		return res
	}
	res := get(svg["asset"].(string), testCookie(s.URL))
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/svg+xml" || strings.Contains(string(body), "script") {
		t.Fatalf("svg: %d %v %s", res.StatusCode, res.Header, body)
	}
	for _, h := range []string{"X-Content-Type-Options", "Content-Security-Policy", "Cache-Control"} {
		if res.Header.Get(h) == "" {
			t.Errorf("no %s", h)
		}
	}
	if res := get(strings.Repeat("0", 64), testCookie(s.URL)); res.StatusCode != 404 {
		t.Errorf("unknown id: %d", res.StatusCode)
	}
	if res := get("../x", testCookie(s.URL)); res.StatusCode != 404 {
		t.Errorf("not an id: %d", res.StatusCode)
	}
	if res := get(svg["asset"].(string), ""); res.StatusCode == 200 {
		t.Errorf("served without the screen cookie")
	}
}

// imagesFolder は、画像のシステムフォルダの id
func imagesFolder(t *testing.T, h *Hub) string {
	t.Helper()
	for id, f := range h.folders {
		if strings.Contains(string(f.body), `"systemFolder":"@matomezu/image:images"`) {
			return id
		}
	}
	t.Fatal("no images folder")
	return ""
}

func TestDropUnusedAssetsAtStart(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "data.db")
	h, _ := hubAt(t, path)
	used, err := h.ImportAsset(rasterBytes(t, "png", 3, 3))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.ImportAsset(rasterBytes(t, "png", 5, 5)); err != nil {
		t.Fatal(err)
	}
	args, _ := json.Marshal(map[string]any{"folder": imagesFolder(t, h), "type": "@matomezu/image:image", "fields": map[string]any{"asset": used.Asset, "width": used.Width, "height": used.Height}})
	if out, err := h.Perform(performOne("@matomezu/base:page-create", args, nil)); err != nil || !out.OK {
		t.Fatalf("page-create: %v %+v", err, out)
	}
	again, _ := hubAt(t, path)
	ids, err := again.store.AssetIDs()
	if err != nil || len(ids) != 1 || ids[0] != used.Asset {
		t.Fatalf("assets = %v, %v (kept %s)", ids, err, used.Asset)
	}
}

// AI の口も、同じアセットの置き場に、合言葉で置ける（合言葉が無ければ受けない）。置けるのはワークルームに入った AI だけ（参加していなければ not-joined）
func TestAIImportsAnAsset(t *testing.T) {
	t.Parallel()
	s, _ := joinWorld(t, joinStore(t))
	svg := `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"/>`
	octet := map[string]string{"Content-Type": "application/octet-stream", "Cookie": ""}
	if code, _ := send(t, "POST", s.URL+"/api/ai/assets", svg, octet); code == 200 {
		t.Fatalf("taken without the token")
	}
	octet["Authorization"] = "Bearer secret"
	if code, body := send(t, "POST", s.URL+"/api/ai/assets", svg, octet); code != 200 || !strings.Contains(body, `"reason":"not-joined"`) {
		t.Fatalf("/api/ai/assets before joining = %d %s", code, body)
	}
	octet[aiwire.ParticipantHeader] = joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	code, body := send(t, "POST", s.URL+"/api/ai/assets", svg, octet)
	if code != 200 || !strings.Contains(body, `"ok":true`) || !strings.Contains(body, `"width":8`) {
		t.Fatalf("/api/ai/assets = %d %s", code, body)
	}
}
