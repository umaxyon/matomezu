package server

// AI に画像のページの画像を見せる口（MCP 公開ツール read_image）。AI が頼んだときだけ渡す（重いので read_page には付けない）。
// どのアセットを見せるかはページのタイプが答える（assetsOf。core/assets.ts）。PNG・JPEG・GIF・WebP は、AI の読める大きさ（長い辺と画素の数）に縮めて渡し、
// 縮めずに済む物はそのまま渡す。SVG は文字のまま渡す（長すぎる物は MCP の側で断る）

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math"
	"net/http"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	// aiImageEdge・aiImagePixels は、AI に渡す画像の長い辺（px）と画素の数の上限（Claude の画像の読みが縮めずに読む大きさ）
	aiImageEdge   = 1568
	aiImagePixels = 1568 * 28 * 28
	// aiImageBytes は、そのまま渡す画像のバイト数の上限（base64 にして 5MB に収まる）
	aiImageBytes = 3_750_000
	// aiImageDecodePixels は、縮めるために開く画像の画素の数の上限（開くと 1 画素あたり数バイトの場所を取る）
	aiImageDecodePixels = 50_000_000
	// aiImageQuality は、縮めて JPEG にするときの質
	aiImageQuality = 85
)

// 断りの理由（MCP の read_image が文にする）
const (
	aiImageNone    = "no-image"    // ページのタイプが指す画像が無い
	aiImageSeveral = "several"     // ページのタイプが画像をいくつも指す（見せるのは 1 つを指すページだけ）
	aiImageUnsure  = "unsure"      // ページのタイプが答えられない
	aiImageMissing = "no-asset"    // 指す画像が置き場に無い
	aiImageLarge   = "too-large"   // 開くには大きすぎる
	aiImageUnread  = "cannot-read" // 縮めるために開けない（動く WebP など）
)

// aiImage は AI に渡す画像（width・height は元の大きさ、sentWidth・sentHeight は渡す大きさ。SVG は svg に文字で）
type aiImage struct {
	OK         bool   `json:"ok"`
	Reason     string `json:"reason,omitempty"`
	Mime       string `json:"mime,omitempty"`
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`
	SentWidth  int    `json:"sentWidth,omitempty"`
	SentHeight int    `json:"sentHeight,omitempty"`
	Data       string `json:"data,omitempty"`
	SVG        string `json:"svg,omitempty"`
}

// aiPageImage は、AI に見せるページ（見せない所のページは無い物とする）の画像を AI に渡す形で答える口
func (o Options) aiPageImage(w http.ResponseWriter, r *http.Request) {
	_, page := o.Hub.AIPageOf(r.PathValue("page"))
	if page == nil {
		http.Error(w, "no such page", http.StatusNotFound)
		return
	}
	used, err := o.Hub.engine.AssetsInUse([]json.RawMessage{page})
	switch {
	case err != nil:
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	case !used.Sure:
		writeJSON(w, aiImage{Reason: aiImageUnsure})
		return
	case len(used.IDs) == 0:
		writeJSON(w, aiImage{Reason: aiImageNone})
		return
	case len(used.IDs) > 1:
		writeJSON(w, aiImage{Reason: aiImageSeveral})
		return
	}
	a, err := o.Hub.Asset(used.IDs[0])
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if a == nil {
		writeJSON(w, aiImage{Reason: aiImageMissing})
		return
	}
	writeJSON(w, imageForAI(a.Mime, a.Width, a.Height, a.Bytes))
}

// imageForAI は、置き場の画像（種類 mime・幅 width・高さ height・中身 b）を AI に渡す形にする
func imageForAI(mime string, width, height int, b []byte) aiImage {
	if mime == "image/svg+xml" {
		return aiImage{OK: true, Mime: mime, Width: width, Height: height, SVG: string(b)}
	}
	sw, sh := fitForAI(width, height)
	if sw == width && sh == height && len(b) <= aiImageBytes {
		return aiImage{OK: true, Mime: mime, Width: width, Height: height, SentWidth: sw, SentHeight: sh, Data: base64.StdEncoding.EncodeToString(b)}
	}
	if width*height > aiImageDecodePixels {
		return aiImage{Reason: aiImageLarge}
	}
	src, _, err := image.Decode(bytes.NewReader(b))
	if err != nil {
		return aiImage{Reason: aiImageUnread}
	}
	dst := image.NewRGBA(image.Rect(0, 0, sw, sh))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), xdraw.Src, nil)
	out, sentMime, err := encodeForAI(dst, mime == "image/jpeg")
	if err != nil {
		return aiImage{Reason: aiImageUnread}
	}
	return aiImage{OK: true, Mime: sentMime, Width: width, Height: height, SentWidth: sw, SentHeight: sh, Data: base64.StdEncoding.EncodeToString(out)}
}

// fitForAI は、幅 w・高さ h の画像を、比を保って AI に渡す大きさの上限に収めた大きさ（収まっていれば同じ。大きくはしない）
func fitForAI(w, h int) (int, int) {
	scale := 1.0
	if long := max(w, h); long > aiImageEdge {
		scale = float64(aiImageEdge) / float64(long)
	}
	if px := float64(w) * float64(h) * scale * scale; px > aiImagePixels {
		scale *= math.Sqrt(aiImagePixels / px)
	}
	if scale >= 1 {
		return w, h
	}
	return max(1, int(float64(w)*scale)), max(1, int(float64(h)*scale))
}

// encodeForAI は、縮めた画像 img を渡す形にする。写真（元が JPEG）は JPEG、ほかは PNG で、PNG がそのまま渡す上限を超えれば JPEG（透ける所は白に）
func encodeForAI(img *image.RGBA, photo bool) ([]byte, string, error) {
	var buf bytes.Buffer
	if !photo {
		if err := png.Encode(&buf, img); err != nil {
			return nil, "", err
		}
		if buf.Len() <= aiImageBytes {
			return buf.Bytes(), "image/png", nil
		}
		buf.Reset()
	}
	flat := image.NewRGBA(img.Bounds())
	xdraw.Draw(flat, flat.Bounds(), image.NewUniform(color.White), image.Point{}, xdraw.Src)
	xdraw.Draw(flat, flat.Bounds(), img, image.Point{}, xdraw.Over)
	if err := jpeg.Encode(&buf, flat, &jpeg.Options{Quality: aiImageQuality}); err != nil {
		return nil, "", err
	}
	return buf.Bytes(), "image/jpeg", nil
}
