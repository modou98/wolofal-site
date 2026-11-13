import os
import json
import re
import urllib.parse

# Slug lisible pour l'URL d'un poeme, derive de son titre affiche (pas du nom
# de fichier interne). On garde les caracteres wolof accentues (a, e, n, etc.)
# car ils sont porteurs de sens ; on ne retire que la ponctuation.
def slugify(text):
    text = text.strip().lower()
    text = re.sub(r"[’'\"«»,.;:!?()\[\]]", '', text)
    text = re.sub(r'[\s_/]+', '-', text)
    text = re.sub(r'-+', '-', text).strip('-')
    return text or 'poeme'

def build():
    print("Construction de content.js...")
    
    # 1. Lire les auteurs
    with open('data/auteurs.json', 'r', encoding='utf-8') as f:
        authors = json.load(f)
    
    # Lire les thèmes
    themes = []
    themes_path = 'data/themes.json'
    if os.path.exists(themes_path):
        with open(themes_path, 'r', encoding='utf-8') as f:
            themes = json.load(f)

    # Lire le catalogue de manuscrits (Ajami / Transcrit)
    manuscripts = []
    manuscripts_path = 'data/manuscripts.json'
    if os.path.exists(manuscripts_path):
        with open(manuscripts_path, 'r', encoding='utf-8') as f:
            manuscripts = json.load(f)
    
    # Ajouter le tableau des poèmes à chaque auteur
    for author in authors:
        author['poems'] = []

    # Le texte complet des poèmes est stocké à part (data/poemes_content.json)
    # pour garder content.js léger : il est chargé en async par script.js.
    poem_contents = {}
    
    # 2. Parcourir les dossiers d'auteurs et lire leurs fichiers .md
    poems_dir = 'data/poemes'
    if not os.path.exists(poems_dir):
        print(f"Le dossier {poems_dir} n'existe pas.")
        return

    for author in authors:
        folder_name = author.get('folder')
        if not folder_name:
            print(f"Attention : Aucun dossier spécifié pour l'auteur {author.get('name')}.")
            continue
            
        author_dir = os.path.join(poems_dir, folder_name)
        if not os.path.exists(author_dir):
            print(f"Le dossier {author_dir} n'existe pas.")
            continue
            
        for filename in os.listdir(author_dir):
            if filename.endswith('.md'):
                filepath = os.path.join(author_dir, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Parsing très simple du Frontmatter (entête)
                parts = content.split('---', 1)
                if len(parts) < 2:
                    print(f"Fichier {filename} ignoré : format invalide (manque '---').")
                    continue
                    
                header = parts[0].strip()
                body = parts[1].strip()
                
                poem_id = filename.replace('.md', '')
                poem_contents[poem_id] = body
                poem_data = {
                    "id": poem_id
                }
                
                for line in header.split('\n'):
                    if ':' in line:
                        key, val = line.split(':', 1)
                        key = key.strip().lower()
                        val = val.strip()
                        if key == 'title':
                            poem_data['title'] = val
                        elif key == 'excerpt':
                            poem_data['excerpt'] = val
                        elif key == 'audio':
                            val = val.strip()
                            if not val:
                                poem_data['audio'] = None
                            elif val.startswith('{') or val.startswith('['):
                                try:
                                    parsed = json.loads(val)
                                    if isinstance(parsed, list):
                                        for item in parsed:
                                            if isinstance(item, dict) and 'url' in item:
                                                url = item['url']
                                                if 'youtube.com' in url or 'youtu.be' in url:
                                                    item['type'] = 'youtube'
                                                else:
                                                    item['type'] = 'mp3'
                                        poem_data['audio'] = parsed
                                    elif isinstance(parsed, dict) and 'url' in parsed:
                                        url = parsed['url']
                                        if 'youtube.com' in url or 'youtu.be' in url:
                                            parsed['type'] = 'youtube'
                                        else:
                                            parsed['type'] = 'mp3'
                                        poem_data['audio'] = parsed
                                    else:
                                        poem_data['audio'] = parsed
                                except Exception:
                                    poem_data['audio'] = {"type": "mp3", "url": val}
                            elif 'youtube.com' in val or 'youtu.be' in val:
                                poem_data['audio'] = {"type": "youtube", "url": val}
                            else:
                                poem_data['audio'] = {"type": "mp3", "url": val}
                        elif key == 'manuscript':
                            poem_data['manuscript'] = val.strip().replace('//', '/')
                        elif key == 'theme' or key == 'themes':
                            poem_data['themes'] = [t.strip() for t in val.split('|') if t.strip()]
                        elif key == 'stanzasize':
                            try:
                                poem_data['stanzaSize'] = int(val)
                            except ValueError:
                                pass
                        elif key == 'themereview':
                            poem_data['themeReview'] = val
                
                author['poems'].append(poem_data)

        # Slug d'URL par poeme, base sur le titre affiche. Unique au sein de
        # l'auteur seulement (l'URL est deja imbriquee sous l'auteur) : en cas
        # de collision (titres identiques), on ajoute -2, -3, ...
        seen_slugs = {}
        for poem_data in author['poems']:
            base_slug = slugify(poem_data.get('title', poem_data['id']))
            slug = base_slug
            count = seen_slugs.get(base_slug, 0) + 1
            seen_slugs[base_slug] = count
            if count > 1:
                slug = f"{base_slug}-{count}"
            poem_data['slug'] = slug
    
    # 3. Générer content.js (métadonnées) et data/poemes_content.json (textes)
    js_content = "window.authorsData = " + json.dumps(authors, ensure_ascii=False, indent=4) + ";\n"
    js_content += "window.themesData = " + json.dumps(themes, ensure_ascii=False, indent=4) + ";\n"
    js_content += "window.manuscriptsData = " + json.dumps(manuscripts, ensure_ascii=False, indent=4) + ";\n"

    with open('content.js', 'w', encoding='utf-8') as f:
        f.write(js_content)

    with open(os.path.join('data', 'poemes_content.json'), 'w', encoding='utf-8') as f:
        json.dump(poem_contents, f, ensure_ascii=False)

    generate_sitemap(authors)
    fetch_videos()

    print("Succès ! content.js, data/poemes_content.json et sitemap.xml mis à jour.")

# 5. Récupère les vidéos et playlists de la chaîne YouTube : flux RSS public pour
# les vidéos (pas de clé API) + lecture de la page /playlists de la chaîne pour la
# liste des playlists. Si le réseau échoue, on garde l'ancien data/videos.json.
YOUTUBE_CHANNEL_ID = 'UC8LKTbZYLnw3UHQMphdy0Zw'
YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@serignembayediakhate1075'
YT_NS = {
    'a': 'http://www.w3.org/2005/Atom',
    'yt': 'http://www.youtube.com/xml/schemas/2015',
    'media': 'http://search.yahoo.com/mrss/',
}

def _http_get(url):
    import urllib.request
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read()

def _parse_feed(url):
    import xml.etree.ElementTree as ET
    root = ET.fromstring(_http_get(url))
    videos = []
    for entry in root.findall('a:entry', YT_NS):
        stats = entry.find('media:group/media:community/media:statistics', YT_NS)
        videos.append({
            'id': entry.find('yt:videoId', YT_NS).text,
            'title': entry.find('a:title', YT_NS).text,
            'published': entry.find('a:published', YT_NS).text[:10],
            'views': int(stats.get('views')) if stats is not None else None,
        })
    return root.find('a:title', YT_NS).text, videos

# Playlists qui sont des podcasts / émissions (et non des récitations de poèmes) :
# détectées par un mot du titre (sans accents, minuscules). Ajouter un mot ici
# pour classer une autre playlist en « Podcast » sur le site.
PODCAST_KEYWORDS = ['jangat']

def _is_podcast(title):
    import unicodedata
    t = unicodedata.normalize('NFD', title.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return any(k in t for k in PODCAST_KEYWORDS)

def _fetch_playlists():
    html = _http_get(f"{YOUTUBE_CHANNEL_URL}/playlists").decode('utf-8')
    m = re.search(r'var ytInitialData = (\{.*?\});</script>', html, re.S)
    data = json.loads(m.group(1))
    found = []
    def walk(o):
        if isinstance(o, dict):
            if 'lockupViewModel' in o:
                found.append(o['lockupViewModel'])
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(data)
    playlists = []
    for lv in found:
        pid = lv.get('contentId')
        if not pid or not pid.startswith('PL'):
            continue
        title = lv['metadata']['lockupMetadataViewModel']['title']['content']
        blob = json.dumps(lv, ensure_ascii=False)
        count_m = re.search(r'"text": "(\d+)\s*vid', blob)
        thumb_m = re.search(r'i\.ytimg\.com/vi/([\w-]{11})/', blob)
        try:
            _, vids = _parse_feed(f"https://www.youtube.com/feeds/videos.xml?playlist_id={pid}")
        except Exception as e:
            print(f"  playlist {title}: flux indisponible ({e})")
            vids = []
        playlists.append({
            'id': pid,
            'title': title,
            'category': 'podcast' if _is_podcast(title) else 'poemes',
            'count': int(count_m.group(1)) if count_m else len(vids),
            'thumb': thumb_m.group(1) if thumb_m else (vids[0]['id'] if vids else None),
            'videos': vids,
        })
    return playlists

def _fetch_channel_info():
    """Bannière, avatar, abonnés et nombre de vidéos, lus dans l'en-tête de la page de la chaîne."""
    html = _http_get(YOUTUBE_CHANNEL_URL).decode('utf-8')
    data = json.loads(re.search(r'var ytInitialData = (\{.*?\});</script>', html, re.S).group(1))
    blob = json.dumps(data.get('header', {}), ensure_ascii=False)
    blob_clean = blob.replace('\u202f', ' ').replace('\u00a0', ' ').replace(' ', ' ').replace(' ', ' ')
    info = {}
    m = re.search(r'"([\d][\d.,]*(?: ?[kKM])?) abonn', blob_clean)
    if m:
        info['subscribers'] = m.group(1)
    m = re.search(r'"([\d][\d.,]*(?: ?[kKM])?) vid', blob_clean)
    if m:
        info['videoCount'] = m.group(1)
    banners = re.findall(r'https://yt3\.googleusercontent\.com/[^"]+=w(\d+)-fcrop64[^"]*', blob)
    banner_urls = re.findall(r'https://yt3\.googleusercontent\.com/[^"]+=w\d+-fcrop64[^"]*', blob)
    if banner_urls:
        wanted = [u for u in banner_urls if '=w1707-' in u]
        info['banner'] = (wanted or banner_urls)[0]
    meta = data.get('metadata', {}).get('channelMetadataRenderer', {})
    avatar = (meta.get('avatar', {}).get('thumbnails') or [{}])[-1].get('url')
    if avatar:
        info['avatar'] = re.sub(r'=s\d+', '=s176', avatar)
    return info

def fetch_videos():
    try:
        channel_name, videos = _parse_feed(f"https://www.youtube.com/feeds/videos.xml?channel_id={YOUTUBE_CHANNEL_ID}")
        if not videos:
            raise ValueError('flux vide')
        try:
            playlists = _fetch_playlists()
        except Exception as e:
            print(f"Attention : playlists non récupérées ({e}).")
            playlists = []
        out = os.path.join('data', 'videos.json')
        if not playlists and os.path.exists(out):
            # on garde les playlists déjà connues plutôt que de les perdre
            with open(out, encoding='utf-8') as f:
                playlists = json.load(f).get('playlists', [])
        try:
            channel = _fetch_channel_info()
        except Exception as e:
            print(f"Attention : infos de la chaîne non récupérées ({e}).")
            channel = {}
        if not channel and os.path.exists(out):
            with open(out, encoding='utf-8') as f:
                channel = json.load(f).get('channel', {})
        data = {
            'channelId': YOUTUBE_CHANNEL_ID,
            'channel': channel,
            'channelName': channel_name,
            'channelUrl': YOUTUBE_CHANNEL_URL,
            'videos': videos,
            'playlists': playlists,
        }
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"{len(videos)} vidéos et {len(playlists)} playlists YouTube récupérées.")
    except Exception as e:
        print(f"Attention : vidéos YouTube non mises à jour ({e}). Ancien data/videos.json conservé.")

# 4. Génère sitemap.xml (page d'accueil + sections + une entrée par auteur/poème)
# pour que Google puisse découvrir et indexer chaque page individuellement.
def generate_sitemap(authors):
    site_url = 'https://wolofalyi.com'

    def loc(path):
        return f"{site_url}{path}"

    entries = [
        (loc('/'), 'weekly', '1.0'),
        (loc('/themes'), 'monthly', '0.6'),
        (loc('/manuscrits'), 'monthly', '0.6'),
        (loc('/videos'), 'weekly', '0.6'),
        (loc('/apropos'), 'yearly', '0.3'),
    ]
    for author in authors:
        slug = author.get('slug')
        if not slug:
            print(f"Attention : pas de slug pour {author.get('name')}, exclu du sitemap.")
            continue
        author_path = f"/{urllib.parse.quote(slug, safe='')}"
        entries.append((loc(author_path), 'monthly', '0.7'))
        for poem in author.get('poems', []):
            poem_path = f"{author_path}/{urllib.parse.quote(poem.get('slug', poem['id']), safe='')}"
            entries.append((loc(poem_path), 'yearly', '0.5'))

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url, freq, priority in entries:
        lines += ['    <url>',
                   f'        <loc>{url}</loc>',
                   f'        <changefreq>{freq}</changefreq>',
                   f'        <priority>{priority}</priority>',
                   '    </url>']
    lines.append('</urlset>')

    with open('sitemap.xml', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

if __name__ == '__main__':
    build()
