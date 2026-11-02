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

Az F1 pálya- és helyszínadatok a verziózott [`server/data/f1-locations.json`](server/data/f1-locations.json) fájlból töltődnek be, ezért a naptár feldolgozásához nincs szükség a GitHub nyers fájljának online elérésére.
