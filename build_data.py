import os
import json
import re

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
    
    # Ajouter le tableau des poèmes à chaque auteur
    for author in authors:
        author['poems'] = []
    
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
                
                poem_data = {
                    "id": filename.replace('.md', ''),
                    "content": body
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
                
                author['poems'].append(poem_data)
    
    # 3. Générer le fichier content.js
    js_content = "window.authorsData = " + json.dumps(authors, ensure_ascii=False, indent=4) + ";\n"
    js_content += "window.themesData = " + json.dumps(themes, ensure_ascii=False, indent=4) + ";\n"
    
    with open('content.js', 'w', encoding='utf-8') as f:
        f.write(js_content)
        
    print("Succès ! Fichier content.js mis à jour avec les dernières données.")

if __name__ == '__main__':
    build()
