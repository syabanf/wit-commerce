package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
)

// uploadPermissions may upload images: store.manage for logos and section images, product.manage
// for product photos.
var uploadPermissions = []string{"store.manage", "product.manage"}

// mediaRoutes registers image upload and, for development, serving the stored files. Production
// nginx serves /media/ from the same directory and never reaches the API for it.
func (s *Server) mediaRoutes(rt *router) {
	rt.table = append(rt.table, Route{
		Method: "POST", Path: prefix + "/media", Permission: uploadPermissions[0], Scope: auth.ScopeFor(uploadPermissions[0]),
		Summary: "Upload a PNG, JPEG or WebP image of at most 5 MB (store.manage or product.manage)",
	})
	rt.mux.HandleFunc("POST "+prefix+"/media", s.uploader(s.uploadMedia))
	rt.mux.HandleFunc("GET /media/{tenant}/{file}", s.serveMedia)
}

// uploader lets in a person with any upload permission, or an API key with store:write or
// catalog:write.
func (s *Server) uploader(h http.HandlerFunc) http.HandlerFunc {
	return s.guarded(func(p auth.Principal) (bool, string) {
		if p.Kind == auth.KindAPIKey {
			for _, permission := range uploadPermissions {
				if p.HasScope(auth.ScopeFor(permission)) {
					return true, ""
				}
			}
			return false, "This API key needs the scope store:write or catalog:write."
		}
		for _, permission := range uploadPermissions {
			if auth.Can(p.Role, permission) {
				return true, ""
			}
		}
		return false, "Your role cannot upload images."
	}, h)
}
