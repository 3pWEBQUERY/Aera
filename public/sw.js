// Aera Service Worker — ausschließlich Web-Push.
//
// Bewusst KEIN fetch-Caching: alle Requests gehen immer ans Netzwerk, damit
// niemals veraltete App-Versionen aus einem Cache ausgeliefert werden.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Alte Caches früherer Worker-Versionen entsorgen.
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      await self.clients.claim();
    })(),
  );
});

// Niemals Requests abfangen — immer Netzwerk.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = { title: "Aera", body: "Neue Benachrichtigung", url: "/home" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* Payload optional */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logo.svg",
      badge: "/logo.svg",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/home";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Offenes Fenster wiederverwenden, sonst neues öffnen.
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
