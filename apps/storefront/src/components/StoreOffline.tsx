import { t } from '../i18n'

/** Shown when the API does not answer, so shoppers do not read an outage as a missing store. */
export function StoreOffline() {
  return (
    <main className="p-4 flex min-h-dvh items-center justify-center bg-surface">
      <title>{t('shell.offline.pageTitle')}</title>
      <div className="max-w-md p-8 rounded-card bg-card text-center shadow-card">
        <h1 className="text-2xl font-bold">{t('shell.offline.title')}</h1>
        <p className="mt-2 text-sm text-muted">
          {t('shell.offline.text')}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 min-h-11 px-5 text-sm font-semibold inline-flex items-center rounded-full bg-ink text-on-ink"
        >
          {t('shell.tryAgain')}
        </button>
      </div>
    </main>
  )
}
