package server

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
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
	long := "<svg>" + strings.Repeat(" ", aiImageSVGChars) + "</svg>"
	if got := imageForAI("image/svg+xml", 8, 4, []byte(long)); got.Reason != aiImageLarge {
		t.Fatalf("long svg = %+v", got)
	}
	if got := imageForAI("image/webp", 3000, 3000, webpLossless(3000, 3000)); got.Reason != aiImageUnread {
		t.Fatalf("broken webp = %+v", got)
	}
	if got := imageForAI("image/png", 10000, 10000, small); got.Reason != aiImageLarge {
		t.Fatalf("huge png = %+v", got)
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
