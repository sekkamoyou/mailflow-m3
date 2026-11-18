#!/usr/bin/env python3
"""One test file at a time; stop on failure, timeout, or excessive RSS."""
from pathlib import Path
import sys
from check import run

files = sys.argv[1:] or sorted(str(p) for p in Path('src').rglob('*.test.js'))
for index, name in enumerate(files, 1):
    print(f'[{index}/{len(files)}] {name}', flush=True)
    # This upstream suite waits through the real 4.5s Undo window across its cases.
    deadline = 150 if name == 'src/utils/threadActions.test.js' else 50
    code = run(['node', '--test', '--test-concurrency=1', f'--test-timeout={(deadline - 5) * 1000}', name],
               '.check-logs/' + name.replace('/', '_') + '.log', deadline, 768)
    if code:
        raise SystemExit(code)
print(f'PASS: {len(files)} test files')
