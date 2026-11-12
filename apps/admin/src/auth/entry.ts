// The public site is the front page of every new tab, even with a saved session; the console takes
// over once the person signs in or chooses to open it. The mark lasts as long as the tab.
const KEY = 'rc.site.entered'

export function hasEntered(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markEntered() {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // Without storage the site shows each time the root opens, which is harmless.
  }
}
