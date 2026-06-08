"""Step 3B0: Check semantic cache, list uncached files."""
import json
from pathlib import Path
from graphify.cache import check_semantic_cache

detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding='utf-8'))
all_files = []
for files in detect['files'].values():
    all_files.extend(files)

cached_nodes, cached_edges, cached_hyperedges, uncached = check_semantic_cache(all_files)

if cached_nodes or cached_edges or cached_hyperedges:
    data = {'nodes': cached_nodes, 'edges': cached_edges, 'hyperedges': cached_hyperedges}
    Path('graphify-out/.graphify_cached.json').write_bytes(
        json.dumps(data, ensure_ascii=False).encode('utf-8')
    )
Path('graphify-out/.graphify_uncached.txt').write_text('\n'.join(uncached), encoding='utf-8')
print(f'Cache: {len(all_files)-len(uncached)} files hit, {len(uncached)} files need extraction')
print(f'  cached: {len(cached_nodes)} nodes, {len(cached_edges)} edges, {len(cached_hyperedges)} hyperedges')
print(f'  uncached: {len(uncached)} files')
