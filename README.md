# F1 Calendar Application

Full-stack F1 verseny naptár alkalmazás ICS szinkronizációval.

## Telepítés Pelican Panelen

A repó tartalmaz egy Pelican egget: [`pelican/egg-f1calendar.json`](pelican/egg-f1calendar.json). A `ghcr.io/pelican-eggs/yolks:nodejs_22` képet használja, és `node startprod.js` paranccsal indul.

### Egg importálása

1. Az admin felületen nyisd meg az **Eggs → Import** oldalt.
2. Töltsd fel a fájlt, vagy add meg a nyers GitHub-címét:
   `https://raw.githubusercontent.com/MarkVebeer/F1-Calendar/main/pelican/egg-f1calendar.json`

### Szerver létrehozása

1. **Servers → Create**, válaszd az **F1 Calendar** egget.
2. Adj hozzá egy portot. Az app a `SERVER_PORT` alapján ezen figyel.
3. Erőforrás: telepítéshez a frontend build miatt legalább 1 GB RAM ajánlott.
4. Töltsd ki a `PUBLIC_URL`, `ADMIN_USERNAME` és `ADMIN_PASSWORD` változókat. A Discord és a Meteoblue kulcsok opcionálisak, nélkülük az adott funkciók nem működnek.
5. A telepítő klónozza a repót, telepíti a függőségeket és lefordítja a frontendet. Utána nyomj **Start**-ot; a konzolon megjelenik a `Server running on port` sor.

Az admin jelszó forrása a panel: minden induláskor onnan szinkronizálódik.

### Kell-e `.env` fájl?

Nem. A panel **Startup** füle mindent tartalmaz, ami a futáshoz kell. `.env` csak ritkán változó beállításhoz kell: `CORS_ORIGIN`, `COOKIE_SECURE`, `DISCORD_REDIRECT_URI`, `TRACK_DATA_DIR`, `JOLPICA_BASE_URL`, `TRACK_GEOJSON_URL`. Hozd létre a szerver mappájának gyökerében, csak ezekkel a sorokkal, majd indítsd újra a szervert. Frissítéskor megmarad. Ha egy változó mindkét helyen szerepel, a panel az erősebb.

### Domain és Discord

Tegyél HTTPS-es reverse proxyt a port elé, és a `PUBLIC_URL`-be ezt a címet írd. A Discord Developer Portalon engedélyezd a `<PUBLIC_URL>/api/discord/callback` átirányítási címet.

### Frissítés

Nyisd meg a szervert Pelicanben, majd **Settings → Reinstall Server**. A telepítő letölti a `GIT_BRANCH` legfrissebb kódját, újratelepíti a függőségeket és újrafordítja a frontendet. A `data` mappa nem változik, az adatbázis-migrációk a következő induláskor futnak, előtte automatikus mentés készül a `data/backups` mappába. Reinstall után indítsd el újra a szervert.

A reinstall magát az egget nem frissíti. Ha egy kiadás új változót hoz, előbb az admin felületen frissítsd az egget, különben nem jelenik meg a **Startup** fülön.

### Meglévő adatok áthozása

Másold az `f1calendar.db`, `f1calendar-admin.db` és `f1calendar-discord.db` fájlokat a `data` mappába, miközben a szerver áll. Induláskor automatikusan a jelenlegi sémára migrálnak.

## Production deploy (Node.js szerver)

### 1) Függőségek telepítése

```bash
npm install
```

### 2) Frontend build

```bash
npm run build
```

### 3) Környezeti változók

- Másold a `.env.example` fájlt `.env` néven.
- Állítsd be **valós** production értékekre (domain, Discord, Meteoblue, erős admin jelszó).

### 4) Indítás production módban

```bash
npm run start
```

Ez a parancs a `startprod.js` fájlt futtatja, ami:

- `NODE_ENV=production` módban indít
- ellenőrzi a kritikus env változókat
- megtiltja a default admin credential használatát
- nem buildel, ezért kódfrissítés után előbb futtasd az `npm run build` parancsot
- elindítja a backendet production hardeninggel (helmet, rate limit, compression, minden originről engedélyezett CORS)

## Megjegyzés

Productionban a backend kiszolgálja a buildelt frontendet a `client/dist` mappából.

A `CORS_ORIGIN=*` beállítással az API bármely domainről elérhető. A `FRONTEND_URL` ettől még az OAuth visszairányítási címe marad, ezért Discordnál a callback URL-t is engedélyezni kell.

## Pályák és SVG-k

A pályaadatok és a rajzok helyi fájlokból jönnek (`/api/tracks/<id>.svg|png`), az oldal futás közben nem tölt külső pályaforrásból.

- A `server/tracks/trackSync.js` naponta és induláskor frissíti a pályalistát, majd legenerálja a hiányzó vagy megváltozott rajzokat a `server/data/generated/` mappába (áthelyezhető a `TRACK_DATA_DIR` változóval).
- A commitolt alapcsomag a `server/data/seed/` mappában van, frissítése: `npm run tracks:build`.
- Ha egy külső forrás nem érhető el, a meglévő pályák változatlanul működnek, csak az új pályák felvétele marad el.
- Ha egy új pályához nem lehet automatikusan rajzot készíteni, placeholder jelenik meg és figyelmeztetés kerül a logba. Kézi vonal adható meg a `server/data/overrides/<circuitId>.geojson` fájlban.

Források: [Jolpica F1 API](https://github.com/jolpica/jolpica-f1) (pálya, város, szezonprogram), [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT, licenc: `server/data/seed/f1-circuits.LICENSE.md`) és tartalékként az [OpenStreetMap](https://www.openstreetmap.org/copyright) (© OpenStreetMap contributors, ODbL).
