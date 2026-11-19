"""Build self-contained, offline-readable Embodied AI Atlas from Markdown.

Install: pip install -r requirements.txt
Run:     python build.py
Output:  dist/index.html (no server or JavaScript dependency downloads needed)
"""
from __future__ import annotations
import json, pathlib, re, html, shutil
import mistune

ROOT = pathlib.Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'content' / 'manifest.json').read_text(encoding='utf-8'))

class AtlasRenderer(mistune.HTMLRenderer):
    def __init__(self):
        super().__init__(escape=False)
        self.toc=[]
        self.head_count=0
    def heading(self, text, level, **attrs):
        self.head_count += 1
        # Numeric IDs are intentionally stable unless heading order changes.
        anchor=f'section-{self.head_count}'
        plain = re.sub(r'<[^>]+>', '', text)
        if level <= 3: self.toc.append({'level':level, 'title':html.unescape(plain), 'id':anchor})
        return f'<h{level} id="{anchor}">{text}</h{level}>\n'

pages=[]
for entry in manifest['pages']:
    path=ROOT/'content'/entry['file']
    if not path.exists(): raise RuntimeError(f'Missing markdown file: {path}')
    source=path.read_text(encoding='utf-8')
    renderer=AtlasRenderer()
    parser=mistune.create_markdown(renderer=renderer, plugins=['table','strikethrough','url','task_lists'])
    body=parser(source)
    pages.append({**entry,'html':body,'toc':renderer.toc,'words':len(re.sub(r'\s+', '', re.sub('<[^>]+>','',body)))})

payload={'site':manifest['site'],'sections':manifest['sections'],'pages':pages}
data=json.dumps(payload,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
css=(ROOT/'assets/site.css').read_text(encoding='utf-8')
js=(ROOT/'assets/site.js').read_text(encoding='utf-8')
page=f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light dark"><meta name="description" content="Embodied AI 训练数据、Data Recipe、机器人学习模型与行业研究的可迭代知识库。"/>
<title>Embodied AI Atlas · 具身智能知识图谱</title>
<style>{css}</style></head><body>
<div id="app"></div>
<script id="atlas-data" type="application/json">{data}</script>
<script>{js}</script>
</body></html>'''
dist=ROOT/'dist'
dist.mkdir(exist_ok=True)
(dist/'index.html').write_text(page,encoding='utf-8')
shutil.copyfile(dist/'index.html',ROOT.parent/'Embodied_AI_Atlas_v0.1.html')
print(f"Built {len(pages)} pages -> {dist/'index.html'} ({len(page)/1024:.0f} KiB)")
