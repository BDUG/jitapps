//! JSON stdin/stdout host for examples/two-views/serve.py.
use codingagentlib::{EmbeddedAgent, RunOptions, ToolPermission};
use serde_json::{json, Value};
use std::{
    io::{self, Write},
    sync::{Arc, Mutex},
};
fn main() -> codingagentlib::Result<()> {
    let mut input = String::new();
    io::stdin().read_line(&mut input)?;
    let data: Value = serde_json::from_str(&input)?;
    let state = Arc::new(Mutex::new(data["state"].clone()));
    let trace = Arc::new(Mutex::new(Vec::<Value>::new()));
    let mut agent = EmbeddedAgent::new(data["state"].clone());
    let events = trace.clone();
    agent.on_event(move |e| {
        events.lock().unwrap().push(e.clone());
        Ok(())
    });
    for name in ["svg_color", "rich_text"] {
        let state = state.clone();
        agent.add_tool(
            name,
            if name == "svg_color" {
                "Change SVG circle color"
            } else {
                "Replace rich text paragraph (plain text)"
            },
            ToolPermission::Edits,
            move |args, _| {
                let value = args["value"].as_str().ok_or("value must be text")?;
                if name == "svg_color" && !["red", "blue", "green", "purple"].contains(&value) {
                    return Err("Choose red, blue, green or purple".into());
                }
                if value.chars().count() > 2000 {
                    return Err("Text too long".into());
                }
                let mut state = state.lock().unwrap();
                state[if name == "svg_color" { "color" } else { "text" }] = json!(value);
                Ok(state.clone())
            },
        )?;
    }
    let result = agent.run(data["goal"].as_str().ok_or("goal required")?, &RunOptions {allow_edits:true,max_steps:Some(3),..Default::default()}, |r| {
        trace.lock().unwrap().push(json!({"kind":"model_request","value":r}));
        if std::env::args().any(|a| a == "--model-bridge") {
            println!("{}", json!({"modelRequest":r})); io::stdout().flush()?;
            let mut reply = String::new(); io::stdin().read_line(&mut reply)?;
            let response: Value = serde_json::from_str(&reply)?;
            trace.lock().unwrap().push(json!({"kind":"model_response","value":response}));
            return Ok(response);
        }
        let observed = r["events"].as_array().unwrap().iter().any(|e|e["kind"]=="observation");
        let parts = r["goal"].as_str().unwrap().split_once(' ');
        let action = parts.filter(|(t,v)|["svg_color","rich_text"].contains(t)&&!v.is_empty()).map(|(t,v)|json!({"tool":t,"args":{"value":v}}));
        let response = json!({"sessionId":r["sessionId"],"step":r["step"],"plan":"Use the selected view tool and inspect its observation","status":if observed {"done"} else if action.is_some() {"act"} else {"ask"},"action":if observed {Value::Null} else {action.unwrap_or(Value::Null)},"summary":"Tool finished; inspect the observation for success or failure.","question":"Try svg_color purple or rich_text Hello world"});
        trace.lock().unwrap().push(json!({"kind":"model_response","value":response})); Ok(response)
    })?;
    println!(
        "{}",
        json!({"state":*state.lock().unwrap(),"trace":*trace.lock().unwrap(),"result":result})
    );
    Ok(())
}
