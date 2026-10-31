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
