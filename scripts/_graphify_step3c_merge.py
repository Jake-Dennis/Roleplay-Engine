"""Step 3C - merge AST + semantic into final extraction."""
import json
from pathlib import Path

ast = json.loads(Path('graphify-out/.graphify_ast.json').read_text(encoding='utf-8'))
sem = json.loads(Path('graphify-out/.graphify_semantic.json').read_text(encoding='utf-8'))

# Merge: AST nodes first, semantic nodes deduplicated by id
seen = {n['id'] for n in ast['nodes']}
merged_nodes = list(ast['nodes'])
for n in sem['nodes']:
    if n['id'] not in seen:
        merged_nodes.append(n)
        seen.add(n['id'])

merged_edges = ast['edges'] + sem['edges']
merged_hyperedges = sem.get('hyperedges', [])
merged = {
    'nodes': merged_nodes,
    'edges': merged_edges,
    'hyperedges': merged_hyperedges,
    'input_tokens': sem.get('input_tokens', 0),
    'output_tokens': sem.get('output_tokens', 0),
}
Path('graphify-out/.graphify_extract.json').write_bytes(
    json.dumps(merged, indent=2, ensure_ascii=False).encode('utf-8')
)
print(f'Merged: {len(merged_nodes)} nodes, {len(merged_edges)} edges, {len(merged_hyperedges)} hyperedges')
print(f'  AST: {len(ast["nodes"])} nodes, {len(ast["edges"])} edges')
print(f'  Semantic: {len(sem["nodes"])} nodes, {len(sem["edges"])} edges')
