"""Step 5 (final) - try one more pass with small communities, then stop if ollama stays hung."""
import json
import urllib.request
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

OLLAMA_URL = 'http://localhost:11434'
OLLAMA_MODEL = 'qwen3.5:4b'
MAX_WORKERS = 1  # serial - ollama is overloaded
MAX_TIME = 30   # short timeout per call

analysis = json.loads(Path('graphify-out/.graphify_analysis.json').read_text(encoding='utf-8'))
extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text(encoding='utf-8'))
communities = {int(k): v for k, v in analysis['communities'].items()}

labels_data = json.loads(Path('graphify-out/.graphify_labels.json').read_text(encoding='utf-8'))
existing = labels_data['labels'] if 'labels' in labels_data else labels_data

id2label = {n['id']: n.get('label', n['id']) for n in extraction['nodes']}
id2src = {n['id']: n.get('source_file', '') for n in extraction['nodes']}

cids_to_label = [cid for cid in communities if not str(cid) in existing or str(existing.get(str(cid), '')).startswith('Community ')]
cids_to_label.sort(key=lambda c: -len(communities[c]))
print(f'Remaining to label: {len(cids_to_label)}')

def label_community(cid):
    members = [id2label.get(nid, nid) for nid in communities[cid][:6]]
    sources_seen = set()
    sources = []
    for nid in communities[cid]:
        src = id2src.get(nid, '')
        if src and src not in sources_seen:
            sources_seen.add(src)
            sources.append(src)
        if len(sources) >= 3:
            break
    prompt = (
        f"Name (2-4 words, no quotes, no explanation): {', '.join(members)}"
    )
    try:
        req = urllib.request.Request(
            f'{OLLAMA_URL}/api/generate',
            data=json.dumps({
                'model': OLLAMA_MODEL,
                'prompt': prompt,
                'stream': False,
                'options': {'temperature': 0.3, 'num_predict': 200, 'thinking': False},
            }).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=MAX_TIME) as resp:
            r = json.loads(resp.read().decode('utf-8'))
            text = r.get('response', '').strip()
            if not text:
                return cid, None  # signal failure
            for ln in text.splitlines():
                ln = ln.strip()
                if ln:
                    text = ln
                    break
            for p_ in ('Name: ', 'Label: ', 'Title: ', '"', "'"):
                if text.startswith(p_):
                    text = text[len(p_):]
            text = text.strip().strip('"').strip("'")
            if len(text) > 50:
                text = text[:50]
            if not text:
                return cid, None
            return cid, text
    except Exception:
        return cid, None

start = time.time()
done = 0
total = len(cids_to_label)
new_labels = {}
consecutive_failures = 0
for cid in cids_to_label:
    cid_r, label = label_community(cid)
    done += 1
    if label is None:
        consecutive_failures += 1
        if consecutive_failures >= 5:
            print(f'  Ollama stuck ({consecutive_failures} consecutive failures). Stopping early.', flush=True)
            break
    else:
        consecutive_failures = 0
        new_labels[str(cid_r)] = label
        if done % 10 == 0 or done <= 3:
            elapsed = time.time() - start
            print(f'  [{done}/{total}] cid={cid_r}={label!r}  {elapsed:.0f}s elapsed', flush=True)

for k, v in new_labels.items():
    existing[k] = v

out = {str(k): v for k, v in existing.items()}
Path('graphify-out/.graphify_labels.json').write_bytes(
    json.dumps(out, ensure_ascii=False).encode('utf-8')
)
elapsed = time.time() - start
real = sum(1 for v in out.values() if not str(v).startswith('Community '))
print(f'Done: {real} real, {len(out)-real} placeholder in {elapsed:.0f}s')
