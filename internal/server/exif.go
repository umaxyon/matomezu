package server

// JPEG の EXIF の向き（Orientation）: 写真の画素を、どう回して・裏返して見るか（1 はそのまま、6 は右へ 90 度など。2〜8）。
// ブラウザは向きを当てて描くので、常駐も幅と高さを向きを当てた値で持ち（assets.go）、AI に渡す画像にも向きを当てる（ai_image.go）

import (
	"encoding/binary"
	"image"
	"image/draw"
)

// exifOrientation は、JPEG の b の EXIF の向き（読めなければ・無ければ 1）
func exifOrientation(b []byte) int {
	if len(b) < 4 || b[0] != 0xFF || b[1] != 0xD8 {
		return 1
	}
	for i := 2; i+4 <= len(b); {
		if b[i] != 0xFF {
			return 1
		}
		marker := b[i+1]
		if marker == 0xDA || marker == 0xD9 { // 画素の始まり・終わり
			return 1
		}
		n := int(binary.BigEndian.Uint16(b[i+2:]))
		end := i + 2 + n
		if n < 2 || end > len(b) {
			return 1
		}
		if seg := b[i+4 : end]; marker == 0xE1 && len(seg) > 6 && string(seg[:6]) == "Exif\x00\x00" {
			return tiffOrientation(seg[6:])
		}
		i = end
	}
	return 1
}

// tiffOrientation は、EXIF の TIFF の頭 t の、最初の IFD の向き（タグ 0x0112。無ければ・形が違えば 1）
func tiffOrientation(t []byte) int {
	if len(t) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(t[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	ifd := int(order.Uint32(t[4:]))
	if ifd < 0 || ifd+2 > len(t) {
		return 1
	}
	count := int(order.Uint16(t[ifd:]))
	for k := range count {
		e := ifd + 2 + k*12
		if e+12 > len(t) {
			return 1
		}
		if order.Uint16(t[e:]) == 0x0112 && order.Uint16(t[e+2:]) == 3 {
			if o := int(order.Uint16(t[e+8:])); o >= 1 && o <= 8 {
				return o
			}
			return 1
		}
	}
	return 1
}

// turned は、向き o が幅と高さを入れ替えるか（5〜8）
func turned(o int) bool { return o >= 5 && o <= 8 }

// oriented は、画素の並び img に向き o を当てた画像（o が 1 なら img のまま）
func oriented(img image.Image, o int) image.Image {
	if o <= 1 || o > 8 {
		return img
	}
	r := img.Bounds()
	w, h := r.Dx(), r.Dy()
	src := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(src, src.Bounds(), img, r.Min, draw.Src)
	dw, dh := w, h
	if turned(o) {
		dw, dh = h, w
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for y := range dh {
		for x := range dw {
			var sx, sy int
			switch o {
			case 2:
				sx, sy = w-1-x, y
			case 3:
				sx, sy = w-1-x, h-1-y
			case 4:
				sx, sy = x, h-1-y
			case 5:
				sx, sy = y, x
			case 6:
				sx, sy = y, h-1-x
			case 7:
				sx, sy = w-1-y, h-1-x
			case 8:
				sx, sy = w-1-y, x
			}
			copy(dst.Pix[dst.PixOffset(x, y):][:4], src.Pix[src.PixOffset(sx, sy):][:4])
		}
	}
	return dst
}
