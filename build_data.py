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

    print("Succès ! content.js, data/poemes_content.json et sitemap.xml mis à jour.")

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
