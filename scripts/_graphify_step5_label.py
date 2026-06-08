"""Step 5 - generate community labels via ollama, then regenerate report + save labels."""
import json
import urllib.request
from pathlib import Path

OLLAMA_URL = 'http://localhost:11434'
OLLAMA_MODEL = 'qwen3.5:4b'

analysis = json.loads(Path('graphify-out/.graphify_analysis.json').read_text(encoding='utf-8'))
extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text(encoding='utf-8'))
detection  = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding='utf-8'))

communities = {int(k): v for k, v in analysis['communities'].items()}

# Build id->label map
id2label = {}
for n in extraction['nodes']:
    id2label[n['id']] = n.get('label', n['id'])

def get_community_members(cid):
    return [id2label.get(nid, nid) for nid in communities.get(cid, [])]

def get_community_sources(cid):
    sources = []
    seen = set()
    for nid in communities.get(cid, []):
        for n in extraction['nodes']:
            if n['id'] == nid and n.get('source_file'):
                if n['source_file'] not in seen:
                    seen.add(n['source_file'])
                    sources.append(n['source_file'])
                break
    return sources

def label_community(cid):
    members = get_community_members(cid)
    sources = get_community_sources(cid)
    sample_labels = members[:8]
    sample_sources = sources[:5]
    prompt = (
        f"Given these related items: {sample_labels}\n"
        f"In files: {sample_sources}\n"
        f"Reply with ONLY a 2-5 word plain-language name that describes what binds them together. "
        f"No punctuation, no quotes, no explanation. Just the name."
    )
    try:
        req = urllib.request.Request(
            f'{OLLAMA_URL}/api/generate',
            data=json.dumps({
                'model': OLLAMA_MODEL,
                'prompt': prompt,
                'stream': False,
                'options': {'temperature': 0.3, 'num_predict': 30},
            }).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            r = json.loads(resp.read().decode('utf-8'))
            text = r.get('response', '').strip().splitlines()[0].strip()
            # Strip common prefixes
            for p in ('Name: ', 'Label: ', 'Title: ', '"', "'"):
                if text.startswith(p):
                    text = text[len(p):]
            text = text.strip().strip('"').strip("'")
            # Truncate to first 50 chars
            if len(text) > 50:
                text = text[:50]
            return text
    except Exception as ex:
        return f'Community {cid}'

# Label each community (sorted by size desc to label big ones first)
cids_sorted = sorted(communities.keys(), key=lambda c: -len(communities[c]))
labels = {}
total = len(cids_sorted)
print(f'Labeling {total} communities via ollama {OLLAMA_MODEL}...')
import time
start = time.time()
for i, cid in enumerate(cids_sorted):
    if i < 5 or i % 25 == 0 or i >= total - 3:
        print(f'  [{i+1}/{total}] cid={cid} size={len(communities[cid])}', flush=True)
    labels[cid] = label_community(cid)
elapsed = time.time() - start
print(f'Done in {elapsed:.1f}s ({elapsed/max(total,1):.2f}s/label)')

# Save labels
Path('graphify-out/.graphify_labels.json').write_bytes(
    json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False).encode('utf-8')
)
print(f'Wrote {len(labels)} labels')

# Regenerate report with real labels
from graphify.build import build_from_json
from graphify.cluster import score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate

G = build_from_json(extraction)
cohesion = {int(k): v for k, v in analysis['cohesion'].items()}
tokens = {'input': extraction.get('input_tokens', 0), 'output': extraction.get('output_tokens', 0)}

questions = suggest_questions(G, communities, labels)
report = generate(
    G, communities, cohesion, labels,
    analysis['gods'], analysis['surprises'], detection, tokens, '.',
    suggested_questions=questions,
)
Path('graphify-out/GRAPH_REPORT.md').write_text(report, encoding='utf-8')
print('Report regenerated with real labels')
print(f'Questions: {len(questions)}')
for q in questions[:3]:
    print(f'  - {q}')
