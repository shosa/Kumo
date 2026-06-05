# Kumo — Release Process

Guida completa per pubblicare una nuova versione. Seguire ogni step nell'ordine indicato.

---

## Prerequisiti

- Accesso push a `github.com/shosa/Kumo`
- `gh` CLI autenticato (`gh auth status`)
- Node.js e dipendenze installate (`npm install`)

---

## 1. Preparazione

### 1.1 Assicurarsi di essere su `main` e aggiornati

```bash
git checkout main
git pull origin main
```

### 1.2 Verificare che non ci siano modifiche non committate

```bash
git status
```

---

## 2. Bump della versione

Aggiornare il campo `version` in `package.json`:

```json
"version": "X.Y.Z"
```

Convenzione di versioning:
- **Major** (X): redesign visivo, breaking changes, nuove funzionalità strutturali
- **Minor** (Y): nuove funzionalità non breaking
- **Patch** (Z): bug fix, miglioramenti minori

Committare:

```bash
git add package.json
git commit -m "chore: bump version to X.Y.Z"
```

---

## 3. Tag e push

```bash
git tag -a "vX.Y.Z" -m "Kumo X.Y.Z — descrizione breve"
git push origin main
git push origin vX.Y.Z
```

---

## 4. Build

```bash
npm run build
```

L'output viene prodotto in `dist/`. Verificare che i file generati usino i **trattini** nel nome:

```
dist/Kumo-Setup-X.Y.Z.exe          ← installer
dist/Kumo-Setup-X.Y.Z.exe.blockmap ← usato dall'auto-updater per delta update
dist/latest.yml                     ← manifest letto dall'auto-updater
```

> **⚠️ IMPORTANTE — Nomenclatura auto-updater**
>
> `electron-updater` cerca il file specificato in `latest.yml`. Il campo `artifactName` in `package.json` deve essere:
>
> ```json
> "win": {
>   "artifactName": "${productName}-Setup-${version}.${ext}"
> }
> ```
>
> Questo produce `Kumo-Setup-X.Y.Z.exe` (con **trattini**, non spazi).  
> Se il file su disco non corrisponde al nome in `latest.yml`, l'auto-updater non trovará l'installer e l'aggiornamento fallirà silenziosamente.
>
> Verificare sempre che `dist/latest.yml` contenga:
> ```yaml
> path: Kumo-Setup-X.Y.Z.exe
> ```
> e che il file con quel nome esista effettivamente in `dist/`.

---

## 5. Creare la GitHub Release

### 5.1 Creare la release come draft

```bash
gh release create vX.Y.Z \
  --title "Kumo X.Y.Z" \
  --notes "## Cosa c'è di nuovo..." \
  --draft
```

### 5.2 Caricare i file

```bash
gh release upload vX.Y.Z \
  "dist/Kumo-Setup-X.Y.Z.exe" \
  "dist/Kumo-Setup-X.Y.Z.exe.blockmap" \
  "dist/latest.yml" \
  --clobber
```

> `--clobber` sovrascrive file già presenti (utile se si fa un re-upload).

### 5.3 Pubblicare

```bash
gh release edit vX.Y.Z --draft=false --latest
```

---

## 6. Pulizia branch

Dopo il merge e la release, eliminare le branch di feature:

```bash
# Locale
git branch -d nome-branch

# Remoto
git push origin --delete nome-branch
```

---

## 7. Verifica post-release

1. Aprire `https://github.com/shosa/Kumo/releases/tag/vX.Y.Z` e controllare che:
   - I tre file siano allegati: `.exe`, `.blockmap`, `latest.yml`
   - `latest.yml` riporti il nome corretto con trattini
   - La release sia marcata come **Latest**

2. Avviare una versione precedente di Kumo (se disponibile) e verificare che riceva la notifica di aggiornamento automatico.

---

## Checklist rapida

```
[ ] git checkout main && git pull
[ ] Bump version in package.json
[ ] git commit + tag + push (branch + tag)
[ ] npm run build
[ ] Verificare dist/Kumo-Setup-X.Y.Z.exe (trattini, non spazi)
[ ] Verificare dist/latest.yml → path: Kumo-Setup-X.Y.Z.exe
[ ] gh release create --draft
[ ] gh release upload (.exe + .blockmap + latest.yml)
[ ] gh release edit --draft=false --latest
[ ] Controllare la release su GitHub
[ ] Eliminare branch di feature se presenti
```
