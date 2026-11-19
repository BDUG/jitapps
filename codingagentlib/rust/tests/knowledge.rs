use codingagentlib::{Agent, Result, RunOptions};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
struct Workspace(PathBuf);
impl Drop for Workspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn automatic_project_graph_is_portable_and_scoped() -> Result<()> {
    let root = Workspace(std::env::temp_dir().join(format!(
        "knowledge-{}-{}",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
    )));
    fs::create_dir(&root.0)?;
    fs::write(
        root.0.join("main.py"),
        "class Example:\n    def run(self): pass\n",
    )?;
    fs::write(
        root.0.join("needs.rst"),
        ".. req:: Need A\n   :id: REQ_A\n   :links: TEST_A\n\n.. test:: Check A\n   :id: TEST_A\n",
    )?;
    fs::write(root.0.join(".env"), "SECRET=not-memory")?;
    let mut agent = Agent::new(&root.0, &[])?;
    let id = agent.start("Inspect Example", &RunOptions::default())?;
    let turn = agent.next(&id)?;
    assert!(turn["projectKnowledge"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|n| n["label"] == "Example"));
    let graph = agent.dispatch(json!({"op":"project_knowledge","action":"export"}))?;
    let symbol = graph["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["label"] == "Example")
        .unwrap()["id"]
        .clone();
    let annotated=agent.dispatch(json!({"op":"project_knowledge","action":"annotate","nodeId":symbol,"text":"Inspect this class","expectedRevision":graph["revision"]}))?;
    assert_eq!(
        annotated["annotations"][symbol.as_str().unwrap()]["text"],
        "Inspect this class"
    );
    assert!(agent.dispatch(json!({"op":"project_knowledge","action":"annotate","nodeId":symbol,"text":"Stale","expectedRevision":graph["revision"]})).is_err());
    let neighborhood = agent.dispatch(
        json!({"op":"project_knowledge","action":"query","nodeIds":[symbol],"hops":2,"limit":12}),
    )?;
    assert!(neighborhood["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|n| n["type"] == "Project"));
    assert_eq!(
        neighborhood["annotations"][symbol.as_str().unwrap()]["text"],
        "Inspect this class"
    );
    assert!(
        agent.dispatch(json!({"op":"project_knowledge","action":"history"}))?["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["action"] == "annotate")
    );
    let refreshed = agent.dispatch(json!({"op":"project_knowledge","action":"refresh"}))?;
    assert_eq!(
        refreshed["annotations"][symbol.as_str().unwrap()]["text"],
        "Inspect this class"
    );
    assert!(!graph.to_string().contains(".env"));
    assert!(graph["ontology"]["classes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|c| c["label"] == "Example"));
    assert!(graph["edges"]
        .as_array()
        .unwrap()
        .iter()
        .any(|e| e["type"] == "depends_on"));
    let empty =
        agent.dispatch(json!({"op":"project_knowledge","action":"export","project":"Other"}))?;
    assert!(empty["nodes"].as_array().unwrap().is_empty());
    let imported=agent.dispatch(json!({"op":"project_knowledge","action":"import","project":"Other","payload":graph,"expectedRevision":"missing"}))?;
    assert_eq!(imported["project"], "Other");
    assert!(agent.dispatch(json!({"op":"project_knowledge","action":"import","project":"Other","payload":graph,"expectedRevision":"missing"})).is_err());
    let ontology =
        agent.dispatch(json!({"op":"project_knowledge","action":"ontology","project":"Other"}))?;
    assert_eq!(ontology["format"], "codingagentlib/project-ontology-v1");
    agent.dispatch(json!({"op":"project_knowledge","action":"refresh","project":"Other"}))?;
    Ok(())
}
