import http.server
import socketserver
import json
import urllib.parse
import os
import re
import sys
from build_data import build

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8085

# Mot de passe protégeant les endpoints d'écriture (/api/*).
# Stocké dans admin_password.txt (gitignoré) ; généré au premier lancement.
PASSWORD_FILE = 'admin_password.txt'

def load_admin_password():
    if os.path.exists(PASSWORD_FILE):
        with open(PASSWORD_FILE, 'r', encoding='utf-8') as f:
            pw = f.read().strip()
        if pw:
            return pw
    import secrets
    pw = secrets.token_urlsafe(9)
    with open(PASSWORD_FILE, 'w', encoding='utf-8') as f:
        f.write(pw + '\n')
    return pw

ADMIN_PASSWORD = load_admin_password()

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    return re.sub(r'[-\s]+', '_', text).strip('_')

POEMES_ROOT = os.path.abspath(os.path.join("data", "poemes"))

def resolve_poem_path(author_folder, poem_id):
    """Résout un chemin de fichier .md à partir d'un dossier auteur et d'un id de poème,
    en rejetant toute tentative de sortir de data/poemes (path traversal)."""
    if not re.fullmatch(r'[\w-]+', author_folder or ''):
        raise Exception("Dossier auteur invalide.")
    if not re.fullmatch(r'[\w-]+', poem_id or ''):
        raise Exception("ID de poème invalide.")

    with open('data/auteurs.json', 'r', encoding='utf-8') as f:
        authors = json.load(f)
    known_folders = {a.get('folder') for a in authors}
    if author_folder not in known_folders:
        raise Exception("Dossier auteur inconnu.")

    filepath = os.path.join("data", "poemes", author_folder, f"{poem_id}.md")
    abs_filepath = os.path.abspath(filepath)
    if os.path.commonpath([abs_filepath, POEMES_ROOT]) != POEMES_ROOT:
        raise Exception("Chemin de fichier invalide.")
    return filepath

def update_poem_metadata(filepath, themes, audio):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    parts = content.split('---', 1)
    if len(parts) < 2:
        raise Exception("Format de fichier invalide (pas de '---')")
        
    header = parts[0]
    body = parts[1]
    
    header_lines = header.split('\n')
    new_header_lines = []
    
    theme_updated = False
    audio_updated = False
    
    themes_str = " | ".join(themes) if themes else ""
    
    for line in header_lines:
        if ':' in line:
            key, val = line.split(':', 1)
            key_stripped = key.strip().lower()
            if key_stripped == 'theme' or key_stripped == 'themes':
                if themes_str:
                    new_header_lines.append(f"Theme: {themes_str}")
                theme_updated = True
            elif key_stripped == 'audio':
                if audio:
                    new_header_lines.append(f"Audio: {audio}")
                audio_updated = True
            else:
                new_header_lines.append(line.rstrip())
        else:
            if line.strip():
                new_header_lines.append(line.rstrip())
                
    if not theme_updated and themes_str:
        new_header_lines.append(f"Theme: {themes_str}")
    if not audio_updated and audio:
        new_header_lines.append(f"Audio: {audio}")
        
    new_header = "\n".join(new_header_lines).strip()
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_header + "\n---\n" + body.strip() + "\n")

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Les médias (images, PDF, MP3) changent rarement : on laisse le
        # navigateur les garder un jour. Le reste (HTML/JS/JSON) reste
        # non-cachable pour que les publications soient visibles aussitôt.
        if self.path.startswith('/assets/'):
            self.send_header('Cache-Control', 'public, max-age=86400')
        else:
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    def do_POST(self):
        if self.headers.get('X-Admin-Token', '') != ADMIN_PASSWORD:
            self.send_response(401)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "message": "Mot de passe admin invalide."}).encode('utf-8'))
            return

        if self.path == '/api/save':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                
                author_id = data.get('authorId', '0')
                title = data.get('title', 'Sans Titre')
                excerpt = data.get('excerpt', '')
                
                themes = data.get('themes', [])
                if not themes:
                    single_theme = data.get('theme', '')
                    if single_theme:
                        themes = [single_theme]
                themes_str = " | ".join(themes) if themes else ""
                
                stanza_size = data.get('stanzaSize', '2')
                audio = data.get('audio', '')
                manuscript = data.get('manuscript', '')
                content = data.get('content', '')
                
                if not excerpt:
                    first_lines = [line.strip() for line in content.split('\n') if line.strip() and not line.strip().startswith('##')]
                    excerpt = first_lines[0] if first_lines else title
                
                # Lire auteurs.json pour trouver le dossier
                with open('data/auteurs.json', 'r', encoding='utf-8') as f:
                    authors = json.load(f)
                
                folder = ""
                for a in authors:
                    if str(a.get('id')) == str(author_id):
                        folder = a.get('folder', '')
                        break
                
                if not folder:
                    raise Exception(f"Auteur ID {author_id} non trouvé ou pas de dossier configuré.")
                
                slug = slugify(title)
                filename = f"{slug}.md"
                filepath = os.path.join("data", "poemes", folder, filename)
                
                # Créer le dossier s'il n'existe pas
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                
                # Write MD file
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(f"Title: {title}\n")
                    f.write(f"Excerpt: {excerpt}\n")
                    if themes_str:
                        f.write(f"Theme: {themes_str}\n")
                    if stanza_size and str(stanza_size) != '2':
                        f.write(f"StanzaSize: {stanza_size}\n")
                    if audio:
                        f.write(f"Audio: {audio}\n")
                    if manuscript:
                        f.write(f"Manuscript: {manuscript}\n")
                    f.write("---\n")
                    f.write(content)
                
                # Run build script
                build()
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "file": filename}).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        elif self.path == '/api/update_metadata':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                author_folder = data.get('authorFolder', '')
                poem_id = data.get('poemId', '')
                
                themes = data.get('themes', [])
                if not themes:
                    single_theme = data.get('theme', '')
                    if single_theme:
                        themes = [single_theme]
                
                audio = data.get('audio', '')
                
                if not author_folder or not poem_id:
                    raise Exception("Auteur ou ID de poème manquant.")

                filepath = resolve_poem_path(author_folder, poem_id)
                if not os.path.exists(filepath):
                    raise Exception("Poème introuvable.")
                
                update_poem_metadata(filepath, themes, audio)
                
                # Run build script
                build()
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

with ThreadingHTTPServer(("127.0.0.1", PORT), CustomHandler) as httpd:
    print(f"Serveur actif sur le port {PORT}.")
    print(f"Accédez au site : http://localhost:{PORT}/")
    print(f"Accédez au dashboard : http://localhost:{PORT}/admin.html")
    print(f"Mot de passe admin (fichier {PASSWORD_FILE}) : {ADMIN_PASSWORD}")
    httpd.serve_forever()
