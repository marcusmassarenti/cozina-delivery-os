/**
 * Service worker do Delivery OS — só push.
 *
 * NÃO faz cache de página de propósito. Este é um sistema de números que muda
 * o tempo todo; servir tela offline aqui significaria mostrar faturamento de
 * ontem como se fosse de agora — e número velho sem aviso é o defeito que a
 * gente passou o dia inteiro caçando.
 */

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { titulo: "Delivery OS", corpo: event.data ? event.data.text() : "" }
  }

  event.waitUntil(
    self.registration.showNotification(d.titulo || "Delivery OS", {
      body: d.corpo || "",
      icon: "/deliveryos-icon.png",
      badge: "/deliveryos-icon.png",
      // `tag` faz a notificação nova SUBSTITUIR a anterior do mesmo assunto:
      // sem isso, três dias sem abrir o app viram três resumos empilhados na
      // tela de bloqueio e a pessoa desliga tudo.
      tag: d.tag || "deliveryos",
      renotify: Boolean(d.tag),
      data: { url: d.url || "/inicio" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const destino = (event.notification.data && event.notification.data.url) || "/inicio"

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abas) => {
      // Já tem o app aberto? Foca essa aba em vez de abrir outra — senão o
      // usuário acumula janelas do mesmo sistema.
      for (const aba of abas) {
        if (aba.url.includes(destino) && "focus" in aba) return aba.focus()
      }
      if (abas.length > 0 && "navigate" in abas[0]) {
        return abas[0].navigate(destino).then((a) => a && a.focus())
      }
      return self.clients.openWindow(destino)
    }),
  )
})
