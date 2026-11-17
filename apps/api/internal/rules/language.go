package rules

import "github.com/syabanf/wit-commerce/apps/api/internal/domain"

// StoreLanguages mirrors STORE_LANGUAGES: the languages a store can show its shoppers.
var StoreLanguages = []string{"id", "en"}

// StoreLanguage is the language the tenant's shoppers read: Bahasa Indonesia unless the brand chose
// English (PP 80/2019 Pasal 55).
func StoreLanguage(t domain.Tenant) string {
	if t.StoreLanguage == "en" {
		return "en"
	}
	return "id"
}
