"use client"

import * as React from "react"

const KEY = "cozina:fav-nav"

/**
 * Favoritos do menu, persistidos em localStorage (por navegador).
 * Guarda os hrefs favoritados.
 */
export function useFavorites() {
  const [favs, setFavs] = React.useState<string[]>([])
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setFavs(JSON.parse(raw))
    } catch {
      // ignora
    }
    setReady(true)
  }, [])

  const toggle = React.useCallback((href: string) => {
    setFavs((prev) => {
      const next = prev.includes(href)
        ? prev.filter((h) => h !== href)
        : [...prev, href]
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // ignora
      }
      return next
    })
  }, [])

  const isFav = React.useCallback((href: string) => favs.includes(href), [favs])

  return { favs, isFav, toggle, ready }
}
