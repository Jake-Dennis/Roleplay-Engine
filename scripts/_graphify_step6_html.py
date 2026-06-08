"""Step 6 - Generate graph.html."""
import json
from graphify.build import build_from_json
from graphify.export import to_html
from pathlib import Path

extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text(encoding='utf-8'))
analysis = json.loads(Path('graphify-out/.graphify_analysis.json').read_text(encoding='utf-8'))
labels_data = json.loads(Path('graphify-out/.graphify_labels.json').read_text(encoding='utf-8'))

G = build_from_json(extraction)
communities = {int(k): v for k, v in analysis['communities'].items()}
labels_raw = labels_data['labels'] if 'labels' in labels_data else labels_data
labels = {int(k): v for k, v in labels_raw.items()}
for cid in communities:
    if cid not in labels:
        labels[cid] = f'Community {cid}'

print(f'Generating HTML for {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities...')

# 3866 nodes is under MAX_NODES_FOR_VIZ (typically 5000)
try:
    to_html(G, communities, 'graphify-out/graph.html', community_labels=labels)
    size = Path('graphify-out/graph.html').stat().st_size
    print(f'Wrote graph.html: {size:,} bytes')
except Exception as ex:
    print(f'to_html failed: {type(ex).__name__}: {ex}')
    import traceback
    traceback.print_exc()
