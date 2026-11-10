package httpapi

import (
	"errors"
	"io"
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/modules/media"
)

// uploadMedia stores the multipart field "file" for ?tenantId= and answers with its URL.
func (s *Server) uploadMedia(w http.ResponseWriter, r *http.Request) {
	// The form's boundaries and headers need a little room beyond the file itself.
	r.Body = http.MaxBytesReader(w, r.Body, media.MaxSize+64<<10)
	file, _, err := r.FormFile("file")
	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		writeProblem(w, http.StatusRequestEntityTooLarge, "TOO_LARGE", "The image is larger than 5 MB.")
		return
	case err != nil:
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Send the image as multipart/form-data in the field file.")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, media.MaxSize+1))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if len(data) > media.MaxSize {
		writeProblem(w, http.StatusRequestEntityTooLarge, "TOO_LARGE", "The image is larger than 5 MB.")
		return
	}
	up, err := s.media.Upload(r.Context(), s.meta(r), r.URL.Query().Get("tenantId"), data)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, up)
}

// serveMedia serves an uploaded file in development. Names this API did not make are not found,
// which also keeps a path from leaving the media directory.
func (s *Server) serveMedia(w http.ResponseWriter, r *http.Request) {
	f, err := s.mediaDisk.Open(r.PathValue("tenant"), r.PathValue("file"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}
