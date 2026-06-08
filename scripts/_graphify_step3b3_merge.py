"""Step 3B3 - merge all 27 chunk JSONs into semantic_new.json and merge with cached."""
import json
import glob
from pathlib import Path

# 1. Merge chunks
chunks = sorted(glob.glob('graphify-out/.graphify_chunk_*.json'))
print(f'Found {len(chunks)} chunk files')
all_nodes, all_edges, all_hyperedges = [], [], []
total_in, total_out = 0, 0
bad = 0
for c in chunks:
    try:
        d = json.loads(Path(c).read_text(encoding='utf-8'))
        all_nodes += d.get('nodes', [])
        all_edges += d.get('edges', [])
        all_hyperedges += d.get('hyperedges', [])
        total_in += d.get('input_tokens', 0) or 0
        total_out += d.get('output_tokens', 0) or 0
    except Exception as ex:
        bad += 1
        print(f'  BAD {c}: {ex}')

print(f'Merged {len(chunks)} chunks: {len(all_nodes)} nodes, {len(all_edges)} edges, {len(all_hyperedges)} hyperedges, {total_in:,} in / {total_out:,} out (bad={bad})')
Path('graphify-out/.graphify_semantic_new.json').write_bytes(
    json.dumps({
        'nodes': all_nodes,
        'edges': all_edges,
        'hyperedges': all_hyperedges,
        'input_tokens': total_in,
        'output_tokens': total_out,
    }, indent=2, ensure_ascii=False).encode('utf-8')
)
print('Wrote .graphify_semantic_new.json')

# 2. Merge cached + new into .graphify_semantic.json
cached_path = Path('graphify-out/.graphify_cached.json')
if cached_path.exists():
    cached = json.loads(cached_path.read_text(encoding='utf-8'))
else:
    cached = {'nodes': [], 'edges': [], 'hyperedges': []}

new = json.loads(Path('graphify-out/.graphify_semantic_new.json').read_text(encoding='utf-8'))

all_nodes_combined = cached['nodes'] + new.get('nodes', [])
all_edges_combined = cached['edges'] + new.get('edges', [])
all_hyperedges_combined = cached.get('hyperedges', []) + new.get('hyperedges', [])

# Dedupe nodes by id
seen = set()
deduped = []
for n in all_nodes_combined:
    if n['id'] not in seen:
        seen.add(n['id'])
        deduped.append(n)

merged = {
    'nodes': deduped,
    'edges': all_edges_combined,
    'hyperedges': all_hyperedges_combined,
    'input_tokens': new.get('input_tokens', 0),
    'output_tokens': new.get('output_tokens', 0),
}
Path('graphify-out/.graphify_semantic.json').write_bytes(
    json.dumps(merged, indent=2, ensure_ascii=False).encode('utf-8')
)
print(f'Merged cached+new: {len(deduped)} nodes, {len(all_edges_combined)} edges, {len(all_hyperedges_combined)} hyperedges')
print(f'  ({len(cached["nodes"])} from cache, {len(new["nodes"])} new)')
