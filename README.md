# F1 Calendar Application

Full-stack F1 verseny naptár alkalmazás ICS szinkronizációval.

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
