package httpapi

import (
	"bytes"
	"compress/gzip"
	"mime"
	"net/http"
	"strings"
	"sync"
)

// gzipMinBytes is the smallest answer worth compressing; nginx uses the same floor.
const gzipMinBytes = 1024

var gzipWriters = sync.Pool{New: func() any {
	w, _ := gzip.NewWriterLevel(nil, gzip.DefaultCompression)
	return w
}}

// gzipResponses compresses text answers of 1 KB or more for clients that accept gzip. The event
// streams stay as they are, so each delta reaches the browser at once. An answer that already
// carries a Content-Encoding passes through, and so nginx in front never compresses twice: its
// gzip filter skips a response with a Content-Encoding.
func gzipResponses(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead || strings.HasSuffix(r.URL.Path, "/events") || !acceptsGzip(r.Header.Get("Accept-Encoding")) {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Add("Vary", "Accept-Encoding")
		gw := &gzipWriter{ResponseWriter: w, status: http.StatusOK}
		defer gw.finish()
		next.ServeHTTP(gw, r)
	})
}

func acceptsGzip(header string) bool {
	for _, part := range strings.Split(header, ",") {
		name, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if !strings.EqualFold(strings.TrimSpace(name), "gzip") {
			continue
		}
		q := strings.ReplaceAll(strings.TrimSpace(params), " ", "")
		return q != "q=0" && q != "q=0.0" && q != "q=0.00" && q != "q=0.000"
	}
	return false
}

// compressible names the content types gzip shrinks; images, fonts and archives are compressed already.
func compressible(contentType string) bool {
	media, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}
	switch {
	case strings.HasPrefix(media, "text/"), strings.HasSuffix(media, "+json"), strings.HasSuffix(media, "+xml"):
		return true
	}
	switch media {
	case "application/json", "application/javascript", "application/xml", "image/svg+xml":
		return true
	}
	return false
}

// gzipWriter holds the first bytes of an answer until it knows whether to compress: a short answer,
// an empty status or a type that does not shrink goes out as written.
type gzipWriter struct {
	http.ResponseWriter
	status  int
	header  bool
	decided bool
	buf     bytes.Buffer
	gz      *gzip.Writer
}

func (w *gzipWriter) WriteHeader(code int) {
	if w.header {
		return
	}
	w.header = true
	w.status = code
	// 1xx, 204 and 304 carry no body, so they go out now.
	if code < 200 || code == http.StatusNoContent || code == http.StatusNotModified {
		w.decided = true
		w.ResponseWriter.WriteHeader(code)
	}
}

func (w *gzipWriter) Write(p []byte) (int, error) {
	if !w.header {
		w.WriteHeader(http.StatusOK)
	}
	if w.decided {
		if w.gz != nil {
			return w.gz.Write(p)
		}
		return w.ResponseWriter.Write(p)
	}
	w.buf.Write(p)
	if w.buf.Len() >= gzipMinBytes {
		if err := w.decide(); err != nil {
			return 0, err
		}
	}
	return len(p), nil
}

// decide picks plain or gzip from what it has seen and sends the held bytes.
func (w *gzipWriter) decide() error {
	w.decided = true
	h := w.Header()
	if w.buf.Len() >= gzipMinBytes && h.Get("Content-Encoding") == "" && h.Get("Content-Range") == "" &&
		compressible(h.Get("Content-Type")) {
		h.Set("Content-Encoding", "gzip")
		h.Del("Content-Length")
		w.gz = gzipWriters.Get().(*gzip.Writer)
		w.gz.Reset(w.ResponseWriter)
	}
	w.ResponseWriter.WriteHeader(w.status)
	held := w.buf.Bytes()
	w.buf = bytes.Buffer{}
	if w.gz != nil {
		_, err := w.gz.Write(held)
		return err
	}
	_, err := w.ResponseWriter.Write(held)
	return err
}

// Flush sends what is held, compressed or not, so a streaming handler still streams.
func (w *gzipWriter) Flush() {
	if !w.decided {
		if !w.header {
			w.WriteHeader(http.StatusOK)
		}
		_ = w.decide()
	}
	if w.gz != nil {
		_ = w.gz.Flush()
	}
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (w *gzipWriter) finish() {
	if !w.decided && w.header {
		_ = w.decide()
	}
	if w.gz != nil {
		_ = w.gz.Close()
		gzipWriters.Put(w.gz)
		w.gz = nil
	}
}

// Unwrap lets http.ResponseController reach the connection underneath.
func (w *gzipWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
