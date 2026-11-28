package server

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/jpeg"
	"image/png"
	"math/rand/v2"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
)

// AI に渡す大きさ: 長い辺と画素の数の上限に、比を保って収める。小さな物は大きくしない
func TestFitForAI(t *testing.T) {
	for _, c := range []struct{ w, h, sw, sh int }{
		{800, 600, 800, 600},
		{3136, 1000, 1568, 500},
		{1568, 1568, 1108, 1108},
		{1, 4000, 1, 1568},
	} {
		if sw, sh := fitForAI(c.w, c.h); sw != c.sw || sh != c.sh {
			t.Errorf("fitForAI(%d, %d) = %d, %d; want %d, %d", c.w, c.h, sw, sh, c.sw, c.sh)
		}
	}
}

func sentSize(t *testing.T, got aiImage) (int, int, string) {
	t.Helper()
	b, err := base64.StdEncoding.DecodeString(got.Data)
	if err != nil {
		t.Fatal(err)
	}
	c, kind, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	return c.Width, c.Height, kind
}

// 収まる画像はそのまま、大きな画像は縮めて（写真は JPEG、ほかは PNG）、SVG は文字で渡す。開けない物・開くには大きすぎる物は断る
func TestImageForAI(t *testing.T) {
	small := rasterBytes(t, "png", 40, 20)
	if got := imageForAI("image/png", 40, 20, small); !got.OK || got.Data != base64.StdEncoding.EncodeToString(small) || got.SentWidth != 40 {
		t.Fatalf("small png = %+v", got)
	}
	got := imageForAI("image/png", 2000, 1000, rasterBytes(t, "png", 2000, 1000))
	if w, h, kind := sentSize(t, got); !got.OK || got.Mime != "image/png" || kind != "png" || w != 1568 || h != 784 || got.Width != 2000 || got.SentWidth != 1568 {
		t.Fatalf("large png = %v %v %s (%+v)", w, h, kind, got.Reason)
	}
	got = imageForAI("image/jpeg", 2000, 1000, rasterBytes(t, "jpeg", 2000, 1000))
	if _, _, kind := sentSize(t, got); got.Mime != "image/jpeg" || kind != "jpeg" {
		t.Fatalf("large jpeg = %s %s", got.Mime, kind)
	}
	got = imageForAI("image/gif", 1600, 10, rasterBytes(t, "gif", 1600, 10))
	if w, _, _ := sentSize(t, got); got.Mime != "image/png" || w != 1568 {
		t.Fatalf("large gif = %s %d", got.Mime, w)
	}
	svg := `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"/>`
	if got := imageForAI("image/svg+xml", 8, 4, []byte(svg)); !got.OK || got.SVG != svg || got.Data != "" {
		t.Fatalf("svg = %+v", got)
	}
	if got := imageForAI("image/webp", 3000, 3000, webpLossless(3000, 3000)); got.Reason != aiImageUnread {
		t.Fatalf("broken webp = %+v", got)
	}
	if got := imageForAI("image/png", 10000, 10000, small); got.Reason != aiImageLarge {
		t.Fatalf("huge png = %+v", got)
	}
	// 大きさは収まるが、そのまま渡すにはバイトが多すぎる物は、開き直して渡す
	heavy := noisePNG(t, 1500, 1000)
	if len(heavy) <= aiImageBytes {
		t.Fatalf("the noise png is only %d bytes", len(heavy))
	}
	got = imageForAI("image/png", 1500, 1000, heavy)
	if w, _, kind := sentSize(t, got); !got.OK || w != 1357 || kind != "jpeg" {
		t.Fatalf("heavy png = %d %s %+v", w, kind, got.Reason)
	}
}

// noisePNG は、縮めても PNG が重いままの（画素がばらばらの）、半分透ける PNG
func noisePNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	r := rand.New(rand.NewPCG(1, 2))
	for i := range img.Pix {
		img.Pix[i] = byte(r.Uint32())
	}
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// PNG が重すぎれば JPEG にし、透ける所は白を下に敷く
func TestEncodeForAIFallsBackToJPEGOnWhite(t *testing.T) {
	clear := image.NewRGBA(image.Rect(0, 0, 4, 4))
	out, mime, err := encodeForAI(clear, true)
	if err != nil || mime != "image/jpeg" {
		t.Fatalf("encode = %s %v", mime, err)
	}
	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatal(err)
	}
	if r, g, b, _ := img.At(1, 1).RGBA(); r < 0xf000 || g < 0xf000 || b < 0xf000 {
		t.Fatalf("a clear pixel = %x %x %x; want white", r, g, b)
	}
	if _, mime, _ := encodeForAI(image.NewRGBA(image.Rect(0, 0, 4, 4)), false); mime != "image/png" {
		t.Fatalf("a light picture = %s", mime)
	}
}

// AI の口: 画像のページの画像を渡す。画像の無いページは no-image、ゴミ箱の中のページは無い物（404）
func TestAIReadsThePageImage(t *testing.T) {
	s, h := joinWorld(t, joinStore(t))
	put, err := h.ImportAsset(rasterBytes(t, "png", 6, 3))
	if err != nil {
		t.Fatal(err)
	}
	args, _ := json.Marshal(map[string]any{"folder": imagesFolder(t, h), "type": "@matomezu/image:image", "title": "a", "fields": map[string]any{"asset": put.Asset, "width": put.Width, "height": put.Height}})
	out, err := h.Perform(performOne("@matomezu/base:page-create", args, nil))
	if err != nil || !out.OK {
		t.Fatalf("page-create: %v %+v", err, out)
	}
	var made struct {
		Page string `json:"page"`
	}
	if err := json.Unmarshal(out.Result, &made); err != nil || made.Page == "" {
		t.Fatalf("page-create result = %s", out.Result)
	}
	auth := map[string]string{"Authorization": "Bearer secret", "Cookie": ""}
	code, body := send(t, "GET", s.URL+"/api/ai/pages/"+made.Page+"/image", "", auth)
	if code != 200 || !strings.Contains(body, `"ok":true`) || !strings.Contains(body, `"mime":"image/png"`) || !strings.Contains(body, `"sentWidth":6`) {
		t.Fatalf("image = %d %s", code, body)
	}
	if code, body := send(t, "GET", s.URL+"/api/ai/pages/"+firstPageOfNewBook(t, h)+"/image", "", auth); code != 200 || !strings.Contains(body, `"reason":"no-image"`) {
		t.Fatalf("a drawing page = %d %s", code, body)
	}
	if code, _ := send(t, "GET", s.URL+"/api/ai/pages/none/image", "", auth); code != 404 {
		t.Fatalf("no page = %d", code)
	}
	if done, err := h.Perform(Perform{Actions: []engine.BulkAction{{Action: "@matomezu/base:entry-trash", Args: json.RawMessage(`{"entry":"` + made.Page + `"}`)}}}); err != nil || !done.OK {
		t.Fatalf("entry-trash: %v %+v", err, done)
	}
	if code, body := send(t, "GET", s.URL+"/api/ai/pages/"+made.Page+"/image", "", auth); code != 404 {
		t.Fatalf("image in the trash = %d %s", code, body)
	}
}

// firstPageOfNewBook は、新しいブックを作り、その最初のページ（描くページ）の id
func firstPageOfNewBook(t *testing.T, h *Hub) string {
	t.Helper()
	out, err := h.Perform(performOne("@matomezu/base:book-create", json.RawMessage(`{"title":"N"}`), nil))
	if err != nil || !out.OK {
		t.Fatalf("book-create: %v %+v", err, out)
	}
	var made struct {
		Book string `json:"book"`
	}
	_ = json.Unmarshal(out.Result, &made)
	add := json.RawMessage(`{"type":"@matomezu/drawing:drawing","title":"P"}`)
	if out, err := h.Perform(performOne("@matomezu/base:page-add", add, &engine.On{Book: made.Book})); err != nil || !out.OK {
		t.Fatalf("page-add: %v %+v", err, out)
	}
	b := h.Book(made.Book)
	if b == nil {
		t.Fatalf("no book from %s", out.Result)
	}
	var head struct {
		ID string `json:"id"`
	}
	pages := pagesOfBook(b.Body)
	if len(pages) == 0 || json.Unmarshal(pages[0], &head) != nil {
		t.Fatalf("no page in %s", b.Body)
	}
	return head.ID
}
