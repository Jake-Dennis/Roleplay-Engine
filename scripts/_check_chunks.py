from pathlib import Path
# Check chunk 16 files
chunk16 = Path('graphify-out/.graphify_chunks/chunk_16.txt').read_text(encoding='utf-8').splitlines()
print('Chunk 16 files:')
missing = 0
for f in chunk16:
    f = f.strip()
    if not f:
        continue
    exists = Path(f).is_file()
    if exists:
        print(f'  OK       {f}')
    else:
        print(f'  MISSING  {f}')
        missing += 1
print(f'\nMissing: {missing} / {len([f for f in chunk16 if f.strip()])}')

# Also check a few dynamic-route files
print()
print('Sample dynamic-route files:')
for f in [
    'src/app/api/jobs/[id]/route.ts',
    'src/app/api/wiki/page/[slug]/route.ts',
    'src/app/api/wiki/page/[slug]/validate/route.ts',
    'src/app/(app)/session/[id]/page.tsx',
    '.omo/evidence/ultrawork-oracle-verification-4.txt',
    '.omo/evidence/ultrawork-oracle-verification.txt',
]:
    print(f'  {"OK " if Path(f).is_file() else "MISS"}  {f}')
