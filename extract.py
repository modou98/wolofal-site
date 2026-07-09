import os
import re
import json

os.makedirs('data/poemes', exist_ok=True)

authors = []

def parse_js_data(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Very naive extraction since we know the structure
    # extract id, name, image, shortBio, fullBio
    id_match = re.search(r'id:\s*(\d+)', content)
    name_match = re.search(r'name:\s*"([^"]+)"', content)
    img_match = re.search(r'image:\s*"([^"]+)"', content)
    sb_match = re.search(r'shortBio:\s*"([^"]+)"', content)
    fb_match = re.search(r'fullBio:\s*`([^`]+)`', content)

    author = {
        "id": int(id_match.group(1)) if id_match else None,
        "name": name_match.group(1) if name_match else "",
        "image": img_match.group(1) if img_match else "",
        "shortBio": sb_match.group(1) if sb_match else "",
        "fullBio": fb_match.group(1).strip() if fb_match else ""
    }
    authors.append(author)

    # extract poems
    poem_blocks = re.findall(r'\{\s*id:\s*"([^"]+)",\s*title:\s*"([^"]+)",\s*excerpt:\s*"([^"]+)",\s*content:\s*`([^`]+)`\s*(?:,\s*audio:\s*"([^"]+)"\s*)?\}', content)

    for p in poem_blocks:
        p_id, title, excerpt, p_content, audio = p
        md_filename = f"data/poemes/{p_id}.md"
        with open(md_filename, 'w', encoding='utf-8') as mf:
            mf.write(f"Title: {title}\n")
            mf.write(f"AuthorId: {author['id']}\n")
            mf.write(f"Excerpt: {excerpt}\n")
            if audio:
                mf.write(f"Audio: {audio}\n")
            mf.write("---\n")
            mf.write(p_content.strip())

parse_js_data('data/author_moussa_ka.js')
parse_js_data('data/author_mbaye_diakhate.js')

with open('data/auteurs.json', 'w', encoding='utf-8') as f:
    json.dump(authors, f, ensure_ascii=False, indent=4)

print("Extraction complete.")
