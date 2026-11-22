use crate::Result;
use serde_json::Value;
pub(crate) fn apply(source: &str, edits: &Value) -> Result<(String, usize)> {
    if source.len() > 2_000_000 || source.contains('\0') {
        return Err("apply_edits needs an existing UTF-8 text file under 2 MB".into());
    }
    let edits = edits.as_array().ok_or("Provide an edits array")?;
    if edits.is_empty() || edits.len() > 32 {
        return Err("Provide 1–32 edits against the original snapshot".into());
    }
    let mut spans = vec![];
    let mut size = source.len() as i64;
    for (index, edit) in edits.iter().enumerate() {
        let edit = edit.as_object().ok_or("Each edit must be an object")?;
        if edit
            .keys()
            .any(|k| !["find", "replacement", "count"].contains(&k.as_str()))
        {
            return Err(format!(
                "Edit {}: use find, replacement and optional exact count",
                index + 1
            )
            .into());
        }
        let find = edit
            .get("find")
            .and_then(Value::as_str)
            .ok_or("Edit needs find text")?;
        let replacement = edit
            .get("replacement")
            .and_then(Value::as_str)
            .ok_or("Edit needs replacement text")?;
        let count = edit
            .get("count")
            .map(|n| n.as_u64().ok_or("count must be integer"))
            .transpose()?
            .unwrap_or(1);
        if find.is_empty()
            || find.contains('\0')
            || replacement.contains('\0')
            || !(1..=1000).contains(&count)
        {
            return Err(format!(
                "Edit {}: nonempty find, text replacement and integer count 1–1000 required",
                index + 1
            )
            .into());
        }
        let mut positions = vec![];
        let mut offset = 0;
        while let Some(found) = source[offset..].find(find) {
            let at = offset + found;
            positions.push(at);
            if positions.len() > count as usize {
                return Err(format!("Edit {}: more than {} matches in the original snapshot; use a specific anchor or exact count",index+1,count).into());
            }
            offset = at + source[at..].chars().next().unwrap().len_utf8();
        }
        if positions.len() != count as usize {
            return Err(format!(
                "Edit {}: expected {} matches, found {} in the original snapshot; reread and adapt",
                index + 1,
                count,
                positions.len()
            )
            .into());
        }
        size += (replacement.len() as i64 - find.len() as i64) * count as i64;
        for at in positions {
            spans.push((at, at + find.len(), index, replacement));
        }
    }
    spans.sort_by_key(|span| (span.0, span.1));
    for pair in spans.windows(2) {
        if pair[1].0 < pair[0].1 {
            return Err(format!(
                "Edits {} and {} overlap in the original snapshot; combine the overlapping changes",
                pair[0].2 + 1,
                pair[1].2 + 1
            )
            .into());
        }
    }
    if size > 2_000_000 {
        return Err("The complete edited file would exceed 2 MB; no changes applied".into());
    }
    let mut result = String::with_capacity(size as usize);
    let mut offset = 0;
    for (start, end, _, replacement) in &spans {
        result.push_str(&source[offset..*start]);
        result.push_str(replacement);
        offset = *end;
    }
    result.push_str(&source[offset..]);
    Ok((result, spans.len()))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum PatchOp {
    Add(String),
    Update(Vec<Vec<(char, String)>>),
    Delete,
}

pub(crate) fn parse_patch(patch: &str) -> Result<Vec<(String, PatchOp)>> {
    let lines: Vec<&str> = patch.lines().collect();
    let mut i = 0;
    while i < lines.len() && lines[i].trim().is_empty() {
        i += 1;
    }
    if i >= lines.len() || lines[i].trim() != "*** Begin Patch" {
        return Err("Patch must start with '*** Begin Patch'".into());
    }
    i += 1;
    let mut ops = vec![];
    let mut ended = false;
    while i < lines.len() {
        let line = lines[i];
        if line.trim() == "*** End Patch" {
            ended = true;
            break;
        }
        if let Some(path) = line.strip_prefix("*** Add File: ") {
            let path = path.trim().to_owned();
            if path.is_empty() {
                return Err("Add File requires a path".into());
            }
            i += 1;
            let mut content = Vec::new();
            while i < lines.len() && !lines[i].starts_with("*** ") {
                let l = lines[i];
                let rest = l
                    .strip_prefix('+')
                    .ok_or_else(|| format!("Add File {path}: lines must start with '+'"))?;
                content.push(rest);
                i += 1;
            }
            let mut joined = content.join("\n");
            if !content.is_empty() {
                joined.push('\n');
            }
            ops.push((path, PatchOp::Add(joined)));
        } else if let Some(path) = line.strip_prefix("*** Delete File: ") {
            let path = path.trim().to_owned();
            if path.is_empty() {
                return Err("Delete File requires a path".into());
            }
            i += 1;
            ops.push((path, PatchOp::Delete));
        } else if let Some(path) = line.strip_prefix("*** Update File: ") {
            let path = path.trim().to_owned();
            if path.is_empty() {
                return Err("Update File requires a path".into());
            }
            i += 1;
            let mut hunks = vec![];
            let mut current: Option<Vec<(char, String)>> = None;
            while i < lines.len() && !lines[i].starts_with("*** ") {
                let l = lines[i];
                if l.starts_with("@@") {
                    if let Some(h) = current.take() {
                        hunks.push(h);
                    }
                    current = Some(vec![]);
                } else if let Some(first) = l.chars().next() {
                    if matches!(first, ' ' | '+' | '-') {
                        let h = current
                            .as_mut()
                            .ok_or_else(|| format!("Update File {path}: hunk line before @@"))?;
                        h.push((first, l[1..].to_owned()));
                    } else {
                        return Err(format!("Update File {path}: invalid patch line '{l}'").into());
                    }
                } else {
                    return Err(format!("Update File {path}: empty line without prefix").into());
                }
                i += 1;
            }
            if let Some(h) = current.take() {
                hunks.push(h);
            }
            if hunks.is_empty() {
                return Err(format!("Update File {path}: at least one @@ hunk is required").into());
            }
            ops.push((path, PatchOp::Update(hunks)));
        } else {
            return Err(format!("Unexpected patch directive: {line}").into());
        }
    }
    if !ended {
        return Err("Patch must end with '*** End Patch'".into());
    }
    if ops.is_empty() {
        return Err("Patch contains no file operations".into());
    }
    Ok(ops)
}

pub(crate) fn apply_hunks(source: &str, hunks: &[Vec<(char, String)>]) -> Result<String> {
    if source.len() > 2_000_000 || source.contains('\0') {
        return Err("apply_patch needs a UTF-8 text file under 2 MB".into());
    }
    let had_trailing_nl = source.ends_with('\n');
    let mut lines: Vec<String> = source.lines().map(|l| l.trim_end_matches('\r').to_owned()).collect();
    let mut cursor = 0usize;
    for (hi, hunk) in hunks.iter().enumerate() {
        let old_lines: Vec<&str> = hunk
            .iter()
            .filter(|(op, _)| *op == ' ' || *op == '-')
            .map(|(_, s)| s.as_str())
            .collect();
        let new_lines: Vec<String> = hunk
            .iter()
            .filter(|(op, _)| *op == ' ' || *op == '+')
            .map(|(_, s)| s.clone())
            .collect();
        if old_lines.is_empty() {
            let pos = cursor.min(lines.len());
            lines.splice(pos..pos, new_lines.clone());
            cursor = pos + new_lines.len();
            continue;
        }
        let mut found = None;
        for start in cursor..=lines.len().saturating_sub(old_lines.len()) {
            if lines[start..start + old_lines.len()]
                .iter()
                .zip(old_lines.iter())
                .all(|(a, b)| a == b)
            {
                found = Some(start);
                break;
            }
        }
        let pos = found.ok_or_else(|| {
            format!(
                "Hunk {} did not match source context; reread the file",
                hi + 1
            )
        })?;
        lines.splice(pos..pos + old_lines.len(), new_lines.clone());
        cursor = pos + new_lines.len();
    }
    let mut out = lines.join("\n");
    if had_trailing_nl || !out.is_empty() {
        out.push('\n');
    }
    if out.len() > 2_000_000 {
        return Err("Patched file exceeds 2 MB limit".into());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn immutable_original_unicode_crlf_and_counts() {
        let (text,count)=apply("one two\r\n🧪 café\r\nuntouched\r\n",&json!([{"find":"one","replacement":"two"},{"find":"two","replacement":"three"},{"find":"🧪","replacement":"✓"}])).unwrap();
        assert_eq!(text, "two three\r\n✓ café\r\nuntouched\r\n");
        assert_eq!(count, 3);
        assert_eq!(
            apply("x x", &json!([{"find":"x","replacement":"y","count":2}])).unwrap(),
            ("y y".to_owned(), 2)
        );
    }
    #[test]
    fn rejects_ambiguity_overlap_missing_and_bad_shapes() {
        for edits in [
            json!([]),
            json!([{"find":"missing","replacement":"x"}]),
            json!([{"find":"one two","replacement":"x"},{"find":"two","replacement":"y"}]),
            json!([{"find":"one","replacement":"x","count":true}]),
            json!([{"find":"one","replacement":"x","unexpected":1}]),
            json!([{"find":"","replacement":"x"}]),
        ] {
            assert!(apply("one two", &edits).is_err());
        }
        for count in [1, 2] {
            assert!(apply(
                "aaa",
                &json!([{"find":"aa","replacement":"x","count":count}])
            )
            .is_err());
        }
        assert!(apply(
            "one",
            &json!([{"find":"one","replacement":"x".repeat(2_000_001)}])
        )
        .is_err());
    }
}
