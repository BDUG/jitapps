use codingagentlib::{planning, Agent, Result, RunOptions};
use serde_json::{json, Value};
use std::{fs, time::{SystemTime, UNIX_EPOCH}};

#[test]
fn shared_task_contract() -> Result<()> {
    let cases: Value = serde_json::from_str(include_str!("fixtures/task-planning.json"))?;
    for case in cases.as_array().unwrap() {
        assert_eq!(planning::validate(&case["tasks"]).is_ok(), case["valid"].as_bool().unwrap(), "{}", case["name"]);
        if let Some(actions) = case["actions"].as_array() {
            for action in actions { assert_eq!(planning::action(&case["tasks"], &action["action"]).is_ok(), action["valid"].as_bool().unwrap()); }
        }
    }
    Ok(())
}

#[test]
fn rejected_tasks_never_execute_and_accepted_dependencies_survive_restart() -> Result<()> {
    let root=std::env::temp_dir().join(format!("agent-task-dag-{}-{}",std::process::id(),SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()));
    fs::create_dir(&root)?;
    let result=(|| -> Result<()> {
        fs::write(root.join("source.txt"),"source")?;
        let mut agent=Agent::new(&root,&[])?;
        let id=agent.start("Inspect then implement",&RunOptions{allow_edits:true,..Default::default()})?;
        let tasks=json!([{"id":"inspect","title":"Inspect","status":"in_progress"},{"id":"implement","title":"Implement","status":"pending","dependsOn":["inspect"]}]);
        let mut bad=tasks.clone();bad[0]["dependsOn"]=json!(["missing"]);
        let turn=agent.next(&id)?;
        let rejected=agent.submit(&id,json!({"sessionId":id,"step":turn["step"],"status":"act","plan":"Invalid plan","tasks":bad,"action":{"tool":"write_file","args":{"path":"unexpected.txt","content":"lost","expectedHash":"missing"}}}))?;
        assert_eq!(rejected["status"],"retry");assert!(!root.join("unexpected.txt").exists());
        let turn=agent.next(&id)?;
        let accepted=agent.submit(&id,json!({"sessionId":id,"step":turn["step"],"status":"act","plan":"Inspect prerequisite","tasks":tasks,"action":{"tool":"read_file","taskId":"inspect","args":{"path":"source.txt"}}}))?;
        assert_eq!(accepted["observation"]["ok"],true);agent.close()?;
        let mut agent=Agent::new(&root,&[])?;agent.dispatch(json!({"op":"resume","session":id}))?;
        let turn=agent.next(&id)?;assert_eq!(turn["tasks"],tasks);
        let rejected=agent.submit(&id,json!({"sessionId":id,"step":turn["step"],"status":"act","plan":"Attempt missing binding","action":{"tool":"write_file","args":{"path":"unexpected.txt","content":"lost","expectedHash":"missing"}}}))?;
        assert_eq!(rejected["status"],"retry");assert!(rejected["error"].as_str().unwrap().contains("taskId"));assert!(!root.join("unexpected.txt").exists());
        let mut advanced=tasks.clone();advanced[0]["status"]=json!("done");advanced[1]["status"]=json!("in_progress");
        let turn=agent.next(&id)?;
        let accepted=agent.submit(&id,json!({"sessionId":id,"step":turn["step"],"status":"act","plan":"Implement after inspection","tasks":advanced,"action":{"tool":"write_file","taskId":"implement","args":{"path":"new.txt","content":"implemented","expectedHash":"missing"}}}))?;
        assert_eq!(accepted["observation"]["ok"],true);assert_eq!(fs::read_to_string(root.join("new.txt"))?,"implemented");
        let saved=agent.dispatch(json!({"op":"session","session":id}))?;
        assert_eq!(saved["events"].as_array().unwrap().iter().filter(|e|e["kind"]=="observation").count(),2);
        agent.close()?;Ok(())
    })();
    let _=fs::remove_dir_all(root);result
}
