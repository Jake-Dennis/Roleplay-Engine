"""Step 3B1: Split uncached files into chunks of 22, write chunk prompts."""
import json
import math
from pathlib import Path

uncached = Path('graphify-out/.graphify_uncached.txt').read_text(encoding='utf-8').splitlines()
uncached = [f for f in uncached if f.strip()]

CHUNK_SIZE = 22
total = math.ceil(len(uncached) / CHUNK_SIZE)
print(f'Splitting {len(uncached)} uncached files into {total} chunks of ~{CHUNK_SIZE}')

# Group by directory so related files land in the same chunk
from collections import defaultdict
by_dir = defaultdict(list)
for f in uncached:
    p = Path(f)
    # Group by first 2 path components (e.g. src/app)
    parts = p.parts
    if len(parts) >= 2:
        key = str(Path(parts[0], parts[1]))
    else:
        key = parts[0] if parts else '(root)'
    by_dir[key].append(f)

# Round-robin across groups to fill chunks evenly
chunks = [[] for _ in range(total)]
chunk_idx = 0
# Sort by directory for determinism
for d in sorted(by_dir.keys()):
    for f in by_dir[d]:
        # Find next chunk with room
        for i in range(total):
            if len(chunks[i]) < CHUNK_SIZE:
                chunks[i].append(f)
                break

# Sanity: assert every file is in exactly one chunk
all_chunked = [f for c in chunks for f in c]
assert sorted(all_chunked) == sorted(uncached), f'Mismatch: {len(all_chunked)} vs {len(uncached)}'
assert len(set(all_chunked)) == len(uncached), 'Duplicates in chunks'

# Save chunks
chunks_dir = Path('graphify-out/.graphify_chunks')
chunks_dir.mkdir(parents=True, exist_ok=True)
for i, c in enumerate(chunks, 1):
    (chunks_dir / f'chunk_{i:02d}.txt').write_text('\n'.join(c), encoding='utf-8')

print(f'Wrote {total} chunk file lists to graphify-out/.graphify_chunks/')
print(f'Chunk sizes: min={min(len(c) for c in chunks)} max={max(len(c) for c in chunks)} avg={sum(len(c) for c in chunks)/len(chunks):.1f}')

# Save metadata
Path('graphify-out/.graphify_chunks_meta.json').write_text(
    json.dumps({'total_chunks': total, 'chunk_size': CHUNK_SIZE, 'total_files': len(uncached)}, indent=2),
    encoding='utf-8'
)
