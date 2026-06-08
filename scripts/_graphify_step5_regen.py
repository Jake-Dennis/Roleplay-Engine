"""Step 5 (regen) - regenerate report with current labels."""
import json
from graphify.build import build_from_json
from graphify.cluster import score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from pathlib import Path

extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text(encoding='utf-8'))
detection  = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding='utf-8'))
analysis   = json.loads(Path('graphify-out/.graphify_analysis.json').read_text(encoding='utf-8'))
labels_data = json.loads(Path('graphify-out/.graphify_labels.json').read_text(encoding='utf-8'))

# Handle both wrapped and unwrapped formats
labels_raw = labels_data['labels'] if 'labels' in labels_data else labels_data
labels = {int(k): v for k, v in labels_raw.items()}

# Add fallback for any unlabeled
communities = {int(k): v for k, v in analysis['communities'].items()}
for cid in communities:
    if cid not in labels:
        labels[cid] = f'Community {cid}'

print(f'Loaded {len(labels)} labels ({sum(1 for v in labels.values() if not str(v).startswith("Community "))} real)')

G = build_from_json(extraction)
cohesion = {int(k): v for k, v in analysis['cohesion'].items()}
tokens = {'input': extraction.get('input_tokens', 0), 'output': extraction.get('output_tokens', 0)}

# Regenerate questions with real labels
questions = suggest_questions(G, communities, labels)

report = generate(
    G, communities, cohesion, labels,
    analysis['gods'], analysis['surprises'], detection, tokens, '.',
    suggested_questions=questions,
)
Path('graphify-out/GRAPH_REPORT.md').write_text(report, encoding='utf-8')
print(f'Report regenerated: {len(report):,} chars')
print(f'Gods: {len(analysis["gods"])}, Surprises: {len(analysis["surprises"])}, Questions: {len(questions)}')
for q in questions[:5]:
    print(f'  Q: {q}')
