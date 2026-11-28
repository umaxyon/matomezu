package server

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

// orientedJPEG は、幅 w・高さ h で左の 4 分の 1 が赤い JPEG に、EXIF の向き o を付けた物（order は TIFF のバイトの並び: MM か II）
func orientedJPEG(t *testing.T, w, h, o int, order string) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			c := color.RGBA{255, 255, 255, 255}
			if x < w/4 {
				c = color.RGBA{255, 0, 0, 255}
			}
			img.Set(x, y, c)
		}
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, nil); err != nil {
		t.Fatal(err)
	}
	tiff := []byte{'M', 'M', 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, byte(o), 0, 0, 0, 0, 0, 0, 0, 0}
	if order == "II" {
		tiff = []byte{'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, byte(o), 0, 0, 0, 0, 0, 0, 0, 0, 0}
	}
	payload := append([]byte("Exif\x00\x00"), tiff...)
	n := len(payload) + 2
	app1 := append([]byte{0xFF, 0xE1, byte(n >> 8), byte(n)}, payload...)
	j := b.Bytes()
	return append(append(append([]byte{}, j[:2]...), app1...), j[2:]...)
}

func TestExifOrientation(t *testing.T) {
	t.Parallel()
	for _, order := range []string{"MM", "II"} {
		if o := exifOrientation(orientedJPEG(t, 8, 4, 6, order)); o != 6 {
			t.Errorf("%s orientation = %d", order, o)
		}
	}
	if o := exifOrientation(rasterBytes(t, "jpeg", 8, 4)); o != 1 {
		t.Errorf("no exif = %d", o)
	}
	if o := exifOrientation([]byte{0xFF, 0xD8, 0xFF, 0xE1, 0, 200}); o != 1 {
		t.Errorf("broken = %d", o)
	}
}

// 向きの付いた JPEG は、幅と高さを見える大きさ（向きを当てた値）で持つ
func TestImportedJPEGSizeIsAsSeen(t *testing.T) {
	t.Parallel()
	a, ok := readImage(orientedJPEG(t, 400, 200, 6, "MM"))
	if !ok || a.Width != 200 || a.Height != 400 {
		t.Fatalf("asset = %d×%d (%v)", a.Width, a.Height, ok)
	}
}

// 向きを当てる: 左上の画素が、向きごとに決まった角へ行く
func TestOriented(t *testing.T) {
	t.Parallel()
	src := image.NewRGBA(image.Rect(0, 0, 3, 2))
	red := color.RGBA{255, 0, 0, 255}
	src.Set(0, 0, red)
	for o, at := range map[int]image.Point{1: {0, 0}, 2: {2, 0}, 3: {2, 1}, 4: {0, 1}, 5: {0, 0}, 6: {1, 0}, 7: {1, 2}, 8: {0, 2}} {
		got := oriented(src, o)
		if turned(o) != (got.Bounds().Dx() == 2) {
			t.Errorf("orientation %d: size %v", o, got.Bounds())
		}
		if got.At(at.X, at.Y) != red {
			t.Errorf("orientation %d: the top-left is not at %v", o, at)
		}
	}
}

// AI には、向きを当てて渡す（小さくても作り直す）。右へ 90 度回して見る写真は、左の赤い帯が上に来る
func TestImageForAIIsOriented(t *testing.T) {
	t.Parallel()
	got := imageForAI("image/jpeg", 200, 400, orientedJPEG(t, 400, 200, 6, "MM"))
	b, _ := base64.StdEncoding.DecodeString(got.Data)
	img, _, err := image.Decode(bytes.NewReader(b))
	if err != nil || !got.OK {
		t.Fatalf("image = %v %+v", err, got.Reason)
	}
	if img.Bounds().Dx() != 200 || img.Bounds().Dy() != 400 || got.Width != 200 || got.SentHeight != 400 {
		t.Fatalf("sent %v, told %d×%d", img.Bounds(), got.Width, got.Height)
	}
	if r, g, _, _ := img.At(100, 20).RGBA(); r < 0xc000 || g > 0x4000 {
		t.Errorf("the top is not red: %x %x", r, g)
	}
	if _, g, _, _ := img.At(100, 380).RGBA(); g < 0xc000 {
		t.Errorf("the bottom is not white: %x", g)
	}
}
