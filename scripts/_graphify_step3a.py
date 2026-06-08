"""Step 3A: AST extraction (Windows-safe)."""
import sys
import json
import multiprocessing
from graphify.extract import collect_files, extract
from pathlib import Path


def main():
    code_files = []
    detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding='utf-8'))
    for f in detect.get('files', {}).get('code', []):
        code_files.extend(collect_files(Path(f)) if Path(f).is_dir() else [Path(f)])

    if code_files:
        result = extract(code_files, cache_root=Path('.'))
        data = json.dumps(result, indent=2, ensure_ascii=False).encode('utf-8')
        Path('graphify-out/.graphify_ast.json').write_bytes(data)
        print(f'AST: {len(result["nodes"])} nodes, {len(result["edges"])} edges (from {len(code_files)} files)')
    else:
        Path('graphify-out/.graphify_ast.json').write_bytes(
            json.dumps({'nodes': [], 'edges': [], 'input_tokens': 0, 'output_tokens': 0}, ensure_ascii=False).encode('utf-8')
        )
        print('No code files - skipping AST extraction')


if __name__ == '__main__':
    # Use 'spawn' on Windows to avoid fork issues
    if sys.platform == 'win32':
        multiprocessing.set_start_method('spawn', force=True)
    main()
