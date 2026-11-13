# Passe — Wolofal yi (contexte du projet)

Document de passation : tout ce qu'il faut savoir pour reprendre le projet sans rien redécouvrir.

## 1. Le projet en bref

**Wolofal yi** (`https://wolofalyi.com`) est une archive en ligne de la poésie religieuse wolof en écriture Wolofal (ajami), transmise par les grandes figures du mouridisme. Le site rassemble les textes (~420 poèmes), les manuscrits (PDF Google Drive), des audios et des thèmes. Site statique, sans framework : HTML + CSS + JavaScript pur, une SPA avec routage par URLs propres.

- Dépôt GitHub : `modou98/wolofal-site` (branche `main`)
- Dossier local : `C:\Users\serigne diene\OneDrive - UNIVERSITE D'ARTOIS\Documents\Daara ji\wolofal_site`
- Contact public affiché sur le site : serignmbayjaxate@gmail.com
- Site partenaire promu dans le pied de page : l'application Murid Mind

### Auteurs (ordre d'affichage sur l'accueil)
| id | Nom affiché | Nom alternatif (SEO) | slug |
|---|---|---|---|
| 5 | Seex Sàmba Jaara Mbay | Cheikh Samba Diarra Mbaye | `cheikh-samba-diarra-mbaye` |
| 3 | Sëriñ Moor Kayre | Serigne Mor Kayré | `serigne-mor-kayre` |
| 2 | Sëriñ Mbay Jaxate | Serigne Mbaye Diakhaté | `serigne-mbaye-diakhate` |
| 1 | Sëriñ Muusaa Ka | Serigne Moussa Ka | `serigne-moussa-ka` |
| 4 | Soxna Maymuuna Mbàkke Al Kubra | Sokhna Maïmouna Mbacké | `kubra` |

L'ordre d'affichage = l'ordre du tableau dans `data/auteurs.json` (les `id` ne changent jamais : `manuscripts.json` s'en sert).

## 2. Hébergement et domaine

- **Hébergeur : Netlify** (importé depuis le dépôt GitHub, déploiement automatique à chaque `git push` sur `main`). Build command vide, Publish directory = `.`.
- **Pourquoi Netlify et pas GitHub Pages** : GitHub Pages renvoie un vrai code HTTP 404 pour toute URL propre (seul le fichier `404.html` sert de repli), ce qui empêchait Google d'indexer les pages. Netlify renvoie un vrai 200 grâce au fichier `_redirects` (`/*  /index.html  200`).
- **Domaine** : `wolofalyi.com`, acheté chez IONOS. DNS actuels : `A @ → 75.2.60.5` et `CNAME www → apex-loadbalancer.netlify.com`.
- **Attention** : « réinitialiser » la zone DNS chez IONOS efface tous les enregistrements — il faut alors les recréer.
- Si Netlify répond 401 : désactiver « Visitor access / password protection » dans les réglages du site.
- Fichiers hérités de GitHub Pages devenus inutiles mais laissés en place : `CNAME`, `404.html`, `.nojekyll`.

## 3. Structure des fichiers

```
index.html            page unique (SPA), balises meta, manifest, favicon
style.css             tous les styles
script.js             toute la logique : routeur, rendu, recherche, SEO dynamique
content.js            GÉNÉRÉ (ne pas éditer à la main)
data/auteurs.json     auteurs (nom, altName, slug, bios, image, folder)
data/themes.json      thèmes
data/manuscripts.json manuscrits Ajami / transcrits (liens Google Drive)
data/poemes/<folder>/*.md   un fichier par poème
data/poemes_content.json    GÉNÉRÉ (texte complet des poèmes, chargé à la demande)
build_data.py         génère content.js, poemes_content.json, sitemap.xml
sitemap.xml           GÉNÉRÉ (~420 URLs)
robots.txt            référence le sitemap
_redirects            repli SPA Netlify
manifest.json, service-worker.js, assets/icons/   PWA
admin.html + server.py    interface d'administration LOCALE (server.py ne sert qu'en local)
GUIDE_UTILISATION.txt guide pas à pas (à jour : Netlify, URLs propres, SEO, PWA)
```

## 4. Flux de travail quotidien

1. Modifier un `.md` de poème, `auteurs.json`, `manuscripts.json`… (ou passer par `admin.html` en local via `python server.py`).
2. **Toujours relancer `python build_data.py`** : régénère `content.js`, `data/poemes_content.json` et `sitemap.xml`. Sans ça, le site ne voit pas les changements.
3. `git add` + `git commit` + `git push origin main` → Netlify republie en 1-2 minutes.
4. Aperçu local : serveur `wolofal-site` (port 8085, lancé via `.claude/launch.json`). `server.py` n'a pas de repli SPA : ouvrir `/` puis naviguer, ou taper `app.navigate('author', 'serigne-moussa-ka')` dans la console.

### Format d'un poème (`.md`)
```
Title: Titre affiché
Excerpt: première phrase / aperçu
StanzaSize: 4          (optionnel, défaut 2 = distiques)
Theme: Tawhiid         (un ou plusieurs thèmes)
Manuscript: <lien Drive>   (optionnel — voir note ci-dessous)
Audio: <lien> ou liste JSON de liens  (optionnel)
---
Texte du poème, strophes séparées par une ligne vide
```
- Les strophes se découpent d'abord par lignes vides ; `StanzaSize` ne subdivise un paragraphe **que si** son nombre de lignes est un multiple exact de `StanzaSize`.
- Pour l'audio en plusieurs parties : JSON valide, **sans virgule finale** (un `,]` casse tout silencieusement).
- Les PDF de manuscrits « à part » se déclarent dans `manuscripts.json` (page Manuscrits), pas dans le champ `Manuscript:` du poème (qui l'affiche sur la page du poème).

## 5. Architecture technique à connaître

### Routage (History API, plus de `#`)
- URLs : `/` · `/<slug-auteur>` · `/<slug-auteur>/<slug-poeme>` · `/themes` · `/themes/<id>` · `/manuscrits` · `/apropos`
- Le **slug du poème** est généré automatiquement dans `build_data.py` à partir du champ `Title:` (dédoublonné par auteur avec `-2`, `-3`…). L'**`id` interne** (nom de fichier) reste stable et sert partout ailleurs.
- Les anciens liens `#/auteur/1`, `#/poeme/...` sont redirigés vers les URLs propres (`redirectLegacyHash`). Les ancres `#chap-N` du sommaire de Baarzan ne passent pas par le routeur.
- Les cartes cliquables sont de vrais `<a href>` (indispensable pour les robots).

### Pièges déjà rencontrés
- **Chemins relatifs interdits** : avec `pushState`, toute ressource relative (`content.js`, `assets/...`, `fetch('data/...')`) casse dès qu'on est sur une URL imbriquée. Tout est en chemin absolu (`/content.js`), et `app.assetUrl()` préfixe `/` dans les gabarits. `<base href="/">` a été rejeté car il casse les ancres `#chap-N`.
- **Service worker** : stratégie *network-first* (cache = secours hors-ligne seulement), `/data/*` jamais mis en cache. Version du cache : `wolofal-shell-v2` — à incrémenter si on change la liste d'app shell.
- **Fences Markdown parasites** : des ``` collés dans un `.md` s'affichent comme texte et faussent le comptage de lignes (poème « collé » en un seul bloc). Vérifier avec `grep -rl '```' data/poemes/`.
- **Strophe collée en un bloc** : en général un nombre impair de lignes (diviseur, doublon, mot orphelin, titre répété en 1re ligne). Isoler la ligne fautive avec une ligne vide.
- Cache bust : `style.css?v=14`, `script.js?v=14`, `content.js?v=14`, `poemes_content.json?v=12` — incrémenter le `?v=` après un changement important.

### Alignement et affichage
Tout le texte est aligné **à gauche** (en-têtes, poèmes, pastilles de thèmes) sur toutes les tailles d'écran. Sur mobile, les longs vers wolof retournent à la ligne (comportement normal) ; une police plus petite est possible si besoin.

## 6. SEO et PWA

- Par page : `<title>`, canonical, `og:*`/`twitter:*`, meta description mis à jour en JS (`app.updateMeta`), JSON-LD schema.org (`WebSite`, `Person` avec `alternateName`, `CreativeWork` genre Poem langue `wo`, `CollectionPage`).
- `altName` des auteurs = orthographe française courante (« Serigne Moussa Ka »…) : présent dans la meta description, le JSON-LD et la recherche interne, **volontairement pas affiché** à l'écran.
- `sitemap.xml` entièrement généré par `build_data.py` (home + 3 pages + 5 auteurs + ~411 poèmes).
- **Google Search Console** : propriété `wolofalyi.com`, sitemap soumis. Situation fin août 2026 : ~416/422 pages « Détectée, actuellement non indexée » — normal pour un domaine neuf (file d'attente de crawl), pas un bug. Les quelques erreurs « 404 » datent de la propagation SSL du 18-19 août et sont résolues (la page répond 200).
- Pour progresser en position : liens entrants (description de la chaîne YouTube, réseaux, groupes), demandes d'indexation manuelle des pages clés, patience.
- **PWA** : installable (manifest + service worker + icônes 192/512/apple-touch). Favicon = `assets/icons/icon-192.png`.

## 6 bis. Page Vidéos (chaîne YouTube)

- Chaîne : `@serignembayediakhate1075` (id `UC8LKTbZYLnw3UHQMphdy0Zw`). Routes `/videos` et `/videos/<id-playlist>`.
- `build_data.py` (`fetch_videos`) récupère les 15 dernières vidéos via le flux RSS public et les ~18 playlists en lisant la page `/playlists` de la chaîne (scraping : si YouTube change son format, le build garde l'ancien `data/videos.json` et affiche un avertissement). Résultat : `data/videos.json`.
- Limite : le flux RSS d'une playlist ne donne que ses 15 vidéos les plus récentes ; la page indique le total réel et renvoie vers YouTube.
- Lecteurs `youtube-nocookie.com` chargés au clic seulement. Pour rafraîchir la liste : `python build_data.py` puis `git push`.

## 7. Préférences de travail du propriétaire

- Écrit en français, messages courts, souvent sans accents ; répond « oui » / « fais ça » pour valider.
- Après un correctif vérifié : commit + push direct (il s'attend à voir le résultat en ligne).
- Il corrige quand on devine : **demander une précision plutôt que supposer** (leçon du poème « Yaaram bi naam Faal », corrigé 4 fois avant de comprendre qu'il s'agissait d'un bug du site et non du fichier).
- Le texte des poèmes est sacré : ne jamais « corriger » du wolof de sa propre initiative ; signaler plutôt les anomalies.

## 8. Points ouverts / à surveiller

- `sheex_i_gànnaar_ak_i_kajoor.md` : `StanzaSize: 4` retiré (rimes non concluantes) → à confirmer avec la source.
- Fichiers parasites : `assets/d.png`, `assets/Soxna_Mai_Kabir.jpg.crdownload` (suppression en attente de commit côté git).
- `data/poemes/serigne_mbaye_diakhate/naa_jόg_ta_waare.md` contient un « ό » grec (U+03CC) au lieu du « ó » wolof : probable coquille.
- Possible : réduire la police des poèmes sur petit mobile pour limiter les retours à la ligne.
- Suivre l'indexation dans Search Console (aucune action requise tant que les « non indexées » restent en file d'attente).
