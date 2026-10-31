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
