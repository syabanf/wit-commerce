package media

import (
	"encoding/binary"
	"net/http"
	"testing"
)

// riff wraps one WebP chunk in the RIFF header.
func riff(chunk string, data []byte) []byte {
	b := append([]byte("RIFF\x00\x00\x00\x00WEBP"+chunk), 0, 0, 0, 0)
	binary.LittleEndian.PutUint32(b[16:], uint32(len(data)))
	return append(b, data...)
}

func TestWebPSizeReadsEachChunkKind(t *testing.T) {
	lossless := make([]byte, 10)
	lossless[0] = 0x2f
	binary.LittleEndian.PutUint32(lossless[1:], uint32(640-1)|uint32(480-1)<<14)
	lossy := []byte{0, 0, 0, 0x9d, 0x01, 0x2a, 0, 0, 0, 0}
	binary.LittleEndian.PutUint16(lossy[6:], 320)
	binary.LittleEndian.PutUint16(lossy[8:], 200)
	extended := make([]byte, 10)
	extended[4], extended[5] = 0xff, 0x03 // width - 1 = 1023
	extended[7] = 99                      // height - 1 = 99
	for _, c := range []struct {
		name string
		data []byte
		w, h int
	}{
		{"VP8L", riff("VP8L", lossless), 640, 480},
		{"VP8", riff("VP8 ", lossy), 320, 200},
		{"VP8X", riff("VP8X", extended), 1024, 100},
	} {
		if mime := http.DetectContentType(c.data); mime != "image/webp" {
			t.Errorf("%s sniffed as %s", c.name, mime)
		}
		w, h, err := webpSize(c.data)
		if err != nil || w != c.w || h != c.h {
			t.Errorf("%s: %dx%d %v, want %dx%d", c.name, w, h, err, c.w, c.h)
		}
	}
	if _, _, err := webpSize(riff("JUNK", make([]byte, 10))); err == nil {
		t.Error("an unknown chunk passed")
	}
}
