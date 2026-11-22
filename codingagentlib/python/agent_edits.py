"""Compile several exact edits against one immutable UTF-8 file snapshot."""
MAX_BYTES=2_000_000
MAX_EDITS=32

def apply(source,edits):
    if not isinstance(source,str) or '\0' in source or len(source.encode('utf-8'))>MAX_BYTES:raise ValueError('apply_edits needs an existing UTF-8 text file under 2 MB')
    if not isinstance(edits,list) or not 1<=len(edits)<=MAX_EDITS:raise ValueError('Provide 1–32 edits against the original file snapshot')
    spans=[];size=len(source.encode('utf-8'))
    for index,edit in enumerate(edits):
        if not isinstance(edit,dict) or set(edit)-{'find','replacement','count'}:raise ValueError(f'Edit {index+1}: use find, replacement and optional exact count')
        find=edit.get('find');replacement=edit.get('replacement');count=edit.get('count',1)
        if not isinstance(find,str) or not find or '\0' in find or not isinstance(replacement,str) or '\0' in replacement or type(count) is not int or not 1<=count<=1000:raise ValueError(f'Edit {index+1}: nonempty find, text replacement and integer count 1–1000 required')
        positions=[];offset=0
        while True:
            at=source.find(find,offset)
            if at<0:break
            positions.append(at)
            if len(positions)>count:raise ValueError(f'Edit {index+1}: more than {count} matches in the original snapshot; use a more specific anchor or an exact count')
            offset=at+1
        if len(positions)!=count:raise ValueError(f'Edit {index+1}: expected {count} matches, found {len(positions)} in the original snapshot; reread and adapt')
        size+=count*(len(replacement.encode('utf-8'))-len(find.encode('utf-8')))
        spans.extend((at,at+len(find),index,replacement) for at in positions)
    spans.sort(key=lambda item:(item[0],item[1]))
    previous=None
    for span in spans:
        if previous and span[0]<previous[1]:raise ValueError(f'Edits {previous[2]+1} and {span[2]+1} overlap in the original snapshot; combine the overlapping changes')
        previous=span
    if size>MAX_BYTES:raise ValueError('The complete edited file would exceed 2 MB; no changes applied')
    result=[];offset=0
    for start,end,index,replacement in spans:
        result.extend((source[offset:start],replacement));offset=end
    result.append(source[offset:])
    return ''.join(result),len(spans)


def parse_patch(patch):
    if not isinstance(patch, str) or not patch.strip():
        raise ValueError('Provide a nonempty patch string')
    lines = patch.splitlines()
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i >= len(lines) or lines[i].strip() != '*** Begin Patch':
        raise ValueError("Patch must start with '*** Begin Patch'")
    i += 1
    ops = []
    ended = False
    while i < len(lines):
        line = lines[i]
        if line.strip() == '*** End Patch':
            ended = True
            break
        if line.startswith('*** Add File: '):
            path = line[len('*** Add File: '):].strip()
            if not path:
                raise ValueError('Add File requires a path')
            i += 1
            body = []
            while i < len(lines) and not lines[i].startswith('*** '):
                if not lines[i].startswith('+'):
                    raise ValueError(f"Add File {path}: lines must start with '+'")
                body.append(lines[i][1:])
                i += 1
            text = '\n'.join(body) + ('\n' if body else '')
            ops.append((path, 'add', text))
        elif line.startswith('*** Delete File: '):
            path = line[len('*** Delete File: '):].strip()
            if not path:
                raise ValueError('Delete File requires a path')
            i += 1
            ops.append((path, 'delete', None))
        elif line.startswith('*** Update File: '):
            path = line[len('*** Update File: '):].strip()
            if not path:
                raise ValueError('Update File requires a path')
            i += 1
            hunks = []
            current = None
            while i < len(lines) and not lines[i].startswith('*** '):
                l = lines[i]
                if l.startswith('@@'):
                    if current is not None:
                        hunks.append(current)
                    current = []
                elif l and l[0] in (' ', '+', '-'):
                    if current is None:
                        raise ValueError(f'Update File {path}: hunk line before @@')
                    current.append((l[0], l[1:]))
                else:
                    raise ValueError(f'Update File {path}: invalid patch line {l!r}')
                i += 1
            if current is not None:
                hunks.append(current)
            if not hunks:
                raise ValueError(f'Update File {path}: at least one @@ hunk is required')
            ops.append((path, 'update', hunks))
        else:
            raise ValueError(f'Unexpected patch directive: {line}')
    if not ended:
        raise ValueError("Patch must end with '*** End Patch'")
    if not ops:
        raise ValueError('Patch contains no file operations')
    return ops


def apply_hunks(source, hunks):
    if not isinstance(source, str) or '\0' in source or len(source.encode('utf-8')) > MAX_BYTES:
        raise ValueError('apply_patch needs a UTF-8 text file under 2 MB')
    had_trailing_nl = source.endswith('\n')
    lines = [l.rstrip('\r') for l in source.splitlines()]
    cursor = 0
    for hi, hunk in enumerate(hunks):
        old_lines = [txt for op, txt in hunk if op in (' ', '-')]
        new_lines = [txt for op, txt in hunk if op in (' ', '+')]
        if not old_lines:
            pos = min(cursor, len(lines))
            lines[pos:pos] = new_lines
            cursor = pos + len(new_lines)
            continue
        found = None
        limit = len(lines) - len(old_lines)
        for start in range(cursor, max(cursor, limit + 1)):
            if lines[start:start + len(old_lines)] == old_lines:
                found = start
                break
        if found is None:
            raise ValueError(f'Hunk {hi + 1} did not match source context; reread the file')
        lines[found:found + len(old_lines)] = new_lines
        cursor = found + len(new_lines)
    out = '\n'.join(lines)
    if had_trailing_nl or out:
        out += '\n'
    if len(out.encode('utf-8')) > MAX_BYTES:
        raise ValueError('Patched file exceeds 2 MB limit')
    return out
