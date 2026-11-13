import json, pathlib
d = pathlib.Path(__file__).parent
k = (d/'day2.txt').read_text(encoding='utf-8') + '\n\n' + (d/'day3.txt').read_text(encoding='utf-8')
html = (d/'template.html').read_text(encoding='utf-8')
html = html.replace('__KNOWLEDGE__', json.dumps(k, ensure_ascii=False).replace('</','<\\/'))
html = html.replace('__INSTRUCTIONS__', json.dumps((d/'coach-prompt.md').read_text(encoding='utf-8'), ensure_ascii=False).replace('</','<\\/'))
(d/'index.html').write_text(html, encoding='utf-8')
print('built', len(html))
