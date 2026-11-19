use codingagentlib::{
    core::Model,
    graph_memory::{query, ProjectGraphMemory},
    mosaic::ModelMosaic,
    CancelHandle,
};
use serde_json::json;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

#[test]
fn model_mosaic_routes_without_fallback_or_extra_calls() -> codingagentlib::Result<()> {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let mut models: BTreeMap<String, Model> = BTreeMap::new();
    for id in ["plan", "code", "review"] {
        let captured = calls.clone();
        models.insert(id.into(),Box::new(move |r,_|{captured.lock().unwrap().push(id);Ok(json!({"sessionId":r["sessionId"],"step":r["step"],"status":"done","action":null,"plan":"Inspect","summary":"Complete"}))}));
    }
    let mut mosaic = ModelMosaic::new(
        models,
        BTreeMap::from([
            ("default".into(), "code".into()),
            ("plan".into(), "plan".into()),
            ("review".into(), "review".into()),
        ]),
        3,
    )?;
    let cancel = CancelHandle::default();
    mosaic.call(&json!({"sessionId":"test","step":1}), &cancel)?;
    mosaic.call(&json!({"sessionId":"test","step":2}), &cancel)?;
    mosaic.call(&json!({"sessionId":"test","step":3,"events":[{"kind":"observation","value":{"tool":"run_command","ok":true,"result":{"exitCode":0}}},{"kind":"turn"}]}),&cancel)?;
    assert_eq!(*calls.lock().unwrap(), vec!["plan", "code", "review"]);
    assert!(mosaic.call(&json!({"step":4}), &cancel).is_err());
    assert_eq!(mosaic.inspect()["calls"], 3);
    Ok(())
}

#[test]
fn portable_graph_memory_hops_filters_import_and_project_isolation() -> codingagentlib::Result<()> {
    let graph = json!({"format":"codingagentlib/project-knowledge-v1","version":1,"project":"source","complete":true,"warnings":[],"ontology":{"format":"codingagentlib/project-ontology-v1","version":1,"classes":[{"id":"Symbol","label":"Symbol"}],"relations":[{"id":"calls","label":"calls"}]},"nodes":[{"id":"a","type":"Symbol","label":"Flight","source":{},"properties":{}},{"id":"b","type":"Symbol","label":"Control","source":{},"properties":{}},{"id":"c","type":"Symbol","label":"Sensor","source":{},"properties":{}}],"edges":[{"source":"a","target":"b","type":"calls"},{"source":"b","target":"c","type":"calls"}]});
    let mut memory = ProjectGraphMemory::default();
    let imported = memory.import("flight", &graph, "missing")?;
    assert_eq!(imported["project"], "flight");
    assert!(memory.export("other")?.is_none());
    assert!(memory.import("flight", &graph, "missing").is_err());
    let found = memory.query(
        "flight",
        &json!({"nodeIds":["a"],"hops":2,"direction":"out","relations":["calls"]}),
    )?;
    assert_eq!(found["nodes"].as_array().unwrap().len(), 3);
    assert_eq!(found["edges"].as_array().unwrap().len(), 2);
    assert!(query(&graph, &json!({"hops":5})).is_err());
    assert!(query(&graph, &json!({"nodeIds":["absent"]})).is_err());
    let mut invalid = graph.clone();
    invalid["edges"][0]["target"] = json!("absent");
    assert!(memory.import("other", &invalid, "missing").is_err());
    let mut ontology = memory.ontology("flight")?;
    ontology["classes"][0]["label"] = json!("Renamed concept");
    let updated =
        memory.import_ontology("flight", &ontology, imported["revision"].as_str().unwrap())?;
    assert_eq!(updated["nodes"], imported["nodes"]);
    assert_eq!(
        memory.ontology("flight")?["classes"][0]["label"],
        "Renamed concept"
    );
    assert!(memory
        .import_ontology("flight", &ontology, imported["revision"].as_str().unwrap())
        .is_err());
    ontology["classes"][0]["id"] = json!("Other");
    assert!(memory
        .import_ontology("flight", &ontology, updated["revision"].as_str().unwrap())
        .is_err());
    assert_eq!(
        memory.export("flight")?.unwrap()["revision"],
        updated["revision"]
    );
    let initialized = memory.import_ontology("empty", &graph["ontology"], "missing")?;
    assert!(initialized["nodes"].as_array().unwrap().is_empty());
    Ok(())
}
