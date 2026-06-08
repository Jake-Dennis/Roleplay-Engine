"""Step 5 (resumed) - parallel label the remaining 445 placeholder communities."""
import json
import urllib.request
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

OLLAMA_URL = 'http://localhost:11434'
OLLAMA_MODEL = 'qwen3.5:4b'
MAX_WORKERS = 6  # parallel ollama requests

analysis = json.loads(Path('graphify-out/.graphify_analysis.json').read_text(encoding='utf-8'))
extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text(encoding='utf-8'))

communities = {int(k): v for k, v in analysis['communities'].items()}

# Load existing labels (handle wrapped format)
labels_data = json.loads(Path('graphify-out/.graphify_labels.json').read_text(encoding='utf-8'))
if isinstance(labels_data, dict) and 'labels' in labels_data:
    existing = labels_data['labels']
else:
    existing = labels_data

# Build id->label and id->source_file maps
id2label = {n['id']: n.get('label', n['id']) for n in extraction['nodes']}
id2src = {n['id']: n.get('source_file', '') for n in extraction['nodes']}

# Find communities that still need labeling
cids_to_label = [cid for cid in communities if not str(cid) in existing or str(existing.get(str(cid), '')).startswith('Community ')]
cids_to_label.sort(key=lambda c: -len(communities[c]))
print(f'Need to label: {len(cids_to_label)} (already have {len(existing) - len(cids_to_label)} real)')

def label_community(cid):
    members = [id2label.get(nid, nid) for nid in communities[cid][:8]]
    sources_seen = set()
    sources = []
    for nid in communities[cid]:
        src = id2src.get(nid, '')
        if src and src not in sources_seen:
            sources_seen.add(src)
            sources.append(src)
        if len(sources) >= 5:
            break
    prompt = (
        f"Related items: {members}\n"
        f"Files: {sources}\n"
        f"Reply with ONLY a 2-5 word plain-language name describing what binds them. No punctuation, no quotes, no explanation."
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
            for p_ in ('Name: ', 'Label: ', 'Title: ', '"', "'"):
                if text.startswith(p_):
                    text = text[len(p_):]
            text = text.strip().strip('"').strip("'")
            if len(text) > 50:
                text = text[:50]
            if not text:
                text = f'Community {cid}'
            return cid, text
    except Exception:
        return cid, f'Community {cid}'

start = time.time()
done = 0
total = len(cids_to_label)
new_labels = {}
with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
    futures = {ex.submit(label_community, cid): cid for cid in cids_to_label}
    for fut in as_completed(futures):
        cid, label = fut.result()
        new_labels[str(cid)] = label
        done += 1
        if done % 25 == 0 or done == total or done <= 3:
            elapsed = time.time() - start
            rate = done / elapsed if elapsed > 0 else 0
            eta = (total - done) / rate if rate > 0 else 0
            print(f'  [{done}/{total}] cid={cid}={label!r}  {rate:.1f}/s  eta={eta:.0f}s', flush=True)

# Merge new with existing
for k, v in new_labels.items():
    existing[k] = v

# Save (unwrapped format to match the previous run's labels.json)
out = {str(k): v for k, v in existing.items()}
Path('graphify-out/.graphify_labels.json').write_bytes(
    json.dumps(out, ensure_ascii=False).encode('utf-8')
)
elapsed = time.time() - start
print(f'Done in {elapsed:.1f}s ({done/max(elapsed,1):.1f}/s)')
print(f'Total labels: {len(out)}, real: {sum(1 for v in out.values() if not str(v).startswith("Community "))}')
