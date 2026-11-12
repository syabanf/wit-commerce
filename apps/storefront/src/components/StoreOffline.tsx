/** Shown when the API does not answer, so shoppers do not read an outage as a missing store. */
export function StoreOffline() {
  return (
    <main className="p-4 flex min-h-dvh items-center justify-center bg-surface">
      <title>Store unavailable · WIT Commerce Store</title>
      <div className="max-w-md p-8 rounded-card bg-card text-center shadow-card">
        <h1 className="text-2xl font-bold">The store is not answering</h1>
        <p className="mt-2 text-sm text-muted">
          We could not reach it just now. Your cart is safe in this browser.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 min-h-11 px-5 text-sm font-semibold inline-flex items-center rounded-full bg-ink text-on-ink"
        >
          Try again
        </button>
      </div>
    </main>
  )
}
