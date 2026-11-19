use codingagentlib::beyond_react::{agentless_pipeline, multi_agent_orchestrate, reflexion_run, tree_search, StateGraph, END};
use serde_json::json;
use std::cell::RefCell;
use std::rc::Rc;

#[test]
fn state_graph_and_tree_search_and_agentless_work() {
    let mut g = StateGraph::new(10);
    g.add_node("code", |st| {
        let n = st["attempt"].as_i64().unwrap_or(0) + 1;
        json!({ "attempt": n, "passed": n >= 2 })
    });
    g.add_node("test", |_| json!({ "tested": true }));
    g.set_entry("code")
        .add_edge("code", "test")
        .add_conditional_edges("test", |st| if st["passed"].as_bool() == Some(true) { END.into() } else { "code".into() });
    let res = g.run(json!({ "attempt": 0, "passed": false })).unwrap();
    assert_eq!(res["status"], "complete");
    assert_eq!(res["state"]["attempt"], 2);

    let cur = Rc::new(RefCell::new("init".to_string()));
    let (c1, c2, c3) = (cur.clone(), cur.clone(), cur.clone());
    let ts = tree_search(
        "pick good",
        2,
        2,
        3,
        move || c1.borrow().clone(),
        move |s| *c2.borrow_mut() = s.clone(),
        |_, d| if d == 0 { Some(vec![json!("bad"), json!("good")]) } else { None },
        move |cand| {
            *c3.borrow_mut() = cand.as_str().unwrap().to_string();
            json!({ "val": c3.borrow().clone() })
        },
        |obs| if obs["val"] == "good" { 1.0 } else { 0.0 },
    );
    assert_eq!(ts["bestReward"], 1.0);
    assert_eq!(*cur.borrow(), "good");

    let file = Rc::new(RefCell::new("broken".to_string()));
    let (f1, f2, f3) = (file.clone(), file.clone(), file.clone());
    let ag = agentless_pipeline(
        "fix",
        move || f1.borrow().clone(),
        move |s| *f2.borrow_mut() = s.clone(),
        |_| vec!["lib.rs".into()],
        |_, _| vec![json!("still_broken"), json!("fixed")],
        move |cand| {
            *f3.borrow_mut() = cand.as_str().unwrap().to_string();
            *f3.borrow() == "fixed"
        },
    );
    assert_eq!(ag["passed"], true);
    assert_eq!(*file.borrow(), "fixed");

    let mut lessons = 0usize;
    let rx = reflexion_run(
        "recover",
        5,
        |step, _, refl| match step {
            1 => json!({ "status": "act", "ok": false, "error": "boom" }),
            2 => {
                assert!(refl.is_some());
                json!({ "status": "act", "ok": true, "reflection": { "observation": "boom", "adjustment": "fix" } })
            }
            _ => json!({ "status": "done", "summary": "ok" }),
        },
        |_| lessons += 1,
    )
    .unwrap();
    assert_eq!(rx["status"], "complete");
    assert_eq!(lessons, 1);

    let ma = multi_agent_orchestrate(
        "ship",
        |_| json!(["a.rs"]),
        |_, _| json!("patch"),
        |_, _| json!({ "passed": true }),
        |_, _, _| json!({ "approved": true }),
    );
    assert_eq!(ma["status"], "complete");
}
