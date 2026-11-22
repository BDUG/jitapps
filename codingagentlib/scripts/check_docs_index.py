"""Verify codingagentlib/README.md source-file index and relative links."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / 'README.md'


def tracked_files():
    out = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '--', 'codingagentlib'], cwd=ROOT.parent, text=True)
    return sorted({
        line[len('codingagentlib/'):]
        for line in out.splitlines()
        if line.startswith('codingagentlib/') and (ROOT.parent / line).is_file()
    })


def index_errors(text, files):
    """Check the index itself, not links elsewhere that happen to mention a file."""
    idx_start = text.find('### Complete source-file index')
    if idx_start < 0:
        return ['Missing Complete source-file index section']
    idx_text = re.split(r'(?m)^#{1,3} ', text[idx_start + len('### Complete source-file index'):], maxsplit=1)[0]
    indexed = set(re.findall(r'\[[^\]]+\]\(([^)#]+)\)', idx_text))
    errors = []
    for missing in sorted(set(files) - indexed):
        errors.append('Missing from Complete source-file index: ' + missing)
    count = re.search(r'Inventory: \*\*(\d+) existing nonignored SDK files\*\*', idx_text)
    if not count or int(count.group(1)) != len(files):
        errors.append(f'Index inventory count must be {len(files)} existing nonignored SDK files')
    return errors


def main():
    text = README.read_text(encoding='utf-8')
    files = set(tracked_files())
    errors = index_errors(text, files)
    broken = []
    # Strip fenced code blocks and inline code before checking Markdown links
    prose = re.sub(r'```[\s\S]*?```', '', text)
    prose = re.sub(r'`[^`]+`', '', prose)
    for match in re.finditer(r'\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)', prose):
        target = match.group(1)
        if '://' in target or target.startswith('mailto:'):
            continue
        resolved = (ROOT / target).resolve()
        if not resolved.exists():
            broken.append(target)
    if errors or broken:
        if errors:
            print(*errors, sep='\n', file=sys.stderr)
        if broken:
            print('Broken relative links in README.md:', *sorted(set(broken)), sep='\n  - ', file=sys.stderr)
        return 1
    print(f'OK: {len(files)} existing nonignored SDK files indexed, matching inventory count, 0 broken relative links.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
