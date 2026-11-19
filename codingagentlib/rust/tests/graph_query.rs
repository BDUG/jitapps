use codingagentlib::{graph_memory::query, Result};
use serde_json::Value;

#[test]
fn shared_graph_query_conformance() -> Result<()> {
    let fixtures: Value =
        serde_json::from_str(include_str!("../../conformance/graph-query-v1.json"))?;
    for case in fixtures["cases"].as_array().unwrap() {
        let result = query(&fixtures["graph"], &case["options"]);
        if case["valid"] == false {
            assert!(result.is_err(), "{}", case["name"]);
            continue;
        }
        let found = result?;
        assert_eq!(
            found["fallbackUsed"], case["expected"]["fallbackUsed"],
            "{} fallback",
            case["name"]
        );
        let ids = |key: &str| {
            found[key]
                .as_array()
                .unwrap()
                .iter()
                .map(|n| n["id"].clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            ids("nodes"),
            case["expected"]["nodes"].as_array().unwrap().clone(),
            "{} nodes",
            case["name"]
        );
        assert_eq!(
            ids("edges"),
            case["expected"]["edges"].as_array().unwrap().clone(),
            "{} edges",
            case["name"]
        );
        assert_eq!(
            found["seeds"], case["expected"]["seeds"],
            "{} seeds",
            case["name"]
        );
        let mut annotations = found["annotations"]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        annotations.sort();
        let mut expected = case["expected"]["annotations"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_str().unwrap().to_owned())
            .collect::<Vec<_>>();
        expected.sort();
        assert_eq!(annotations, expected, "{} annotations", case["name"]);
    }
    Ok(())
}
