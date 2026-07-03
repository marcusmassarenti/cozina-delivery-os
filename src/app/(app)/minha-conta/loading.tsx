// Skeleton instantâneo ao trocar de aba (o header + abas do layout ficam
// fixos; só esta área troca) — dá sensação de transição imediata.
export default function MinhaContaLoading() {
  return (
    <div className="animate-pulse p-6">
      <div className="max-w-3xl space-y-4">
        <div className="h-40 rounded-xl border bg-card" />
        <div className="h-64 rounded-xl border bg-card" />
        <div className="h-9 w-32 rounded-md bg-muted" />
      </div>
    </div>
  )
}
