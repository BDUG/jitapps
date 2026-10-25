#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

const PORT: &str = "47831";
struct Backend {
    child: Mutex<Option<CommandChild>>,
    exited: Arc<AtomicBool>,
    closing: AtomicBool,
}
fn fail(app: &tauri::AppHandle, message: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let text = serde_json::to_string(message).unwrap();
        let _ = window.eval(&format!("(() => {{ let el=document.getElementById('status'); if(!el) {{ el=document.createElement('aside');el.id='desktop-runtime-status';el.setAttribute('role','alert');el.style.cssText='position:fixed;top:0;left:0;right:0;background:#fcf5ed;color:#343b43;border-bottom:3px solid #d97a16;padding:16px;z-index:999999';document.body.append(el); }} el.textContent={text}; }})()"));
    }
}
fn main() {
    let app = tauri::Builder::default()
        // No frontend capabilities or invoke handlers. The local pages cannot use shell IPC.
        .plugin(tauri_plugin_shell::init())
        .on_page_load(|webview, _| {
            // Keep same-origin relay/help links usable when an embedded WebView ignores _blank.
            let _ = webview.eval(r#"if (!window.__tlalDesktopLinks) { window.__tlalDesktopLinks=true; document.addEventListener('click', function(event) { const link=event.target.closest && event.target.closest('a[target="_blank"]'); if(!link) return; const url=new URL(link.href,location.href); if(url.origin===location.origin && (url.protocol==='http:' || url.protocol==='https:')) { event.preventDefault(); location.assign(url.href); } }, true); }"#);
        })
        .manage(Backend { child: Mutex::new(None), exited: Arc::new(AtomicBool::new(false)), closing: AtomicBool::new(false) })
        .setup(|app| {
            let data = app.path().app_local_data_dir()?;
            let root = app.path().resource_dir()?.join("suite");
            std::fs::create_dir_all(data.join("workspace"))?;
            std::fs::create_dir_all(data.join("config"))?;
            let args = vec![
                "--suite-root".to_owned(), root.to_string_lossy().into_owned(),
                "--port".to_owned(), PORT.to_owned(),
                "--bind".to_owned(), "127.0.0.1".to_owned(),
                "--config".to_owned(), data.join("config/providers.json").to_string_lossy().into_owned(),
                "--search-config".to_owned(), data.join("config/search.json").to_string_lossy().into_owned(),
                "--skills-db".to_owned(), data.join("skills/catalog.sqlite3").to_string_lossy().into_owned(),
                "--agent-workspace".to_owned(), data.join("workspace").to_string_lossy().into_owned(),
                "--workflow-cwd".to_owned(), data.join("workspace").to_string_lossy().into_owned(),
            ];
            let handle = app.handle().clone();
            let state = app.state::<Backend>();
            let exited = state.exited.clone();
            let spawn = app.shell().sidecar("suite-server")?.args(args).current_dir(&data).spawn();
            match spawn {
                Err(_) => fail(&handle, "Could not launch the bundled suite server. Reinstall the application or check operating-system execution permissions."),
                Ok((mut events, child)) => {
                    *state.child.lock().unwrap() = Some(child);
                    let ready = Arc::new(AtomicBool::new(false));
                    let ready_event = ready.clone();
                    let event_handle = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = events.recv().await {
                            match event {
                                CommandEvent::Stdout(bytes) => {
                                    let text = String::from_utf8_lossy(&bytes);
                                    if text.trim() == format!("Desktop suite, AI relay and web research listening on 127.0.0.1:{PORT}") && !ready_event.swap(true, Ordering::SeqCst) {
                                        if let Some(window) = event_handle.get_webview_window("main") {
                                            let _ = window.navigate(format!("http://127.0.0.1:{PORT}/").parse().unwrap());
                                        }
                                    }
                                }
                                CommandEvent::Terminated(_) => {
                                    exited.store(true, Ordering::SeqCst);
                                    if !ready_event.load(Ordering::SeqCst) {
                                        fail(&event_handle, "The local suite server stopped before startup. Port 47831 may already be in use. Close the other instance and reopen TLAL OS. The application never attaches to an existing server.");
                                    } else if !event_handle.state::<Backend>().closing.load(Ordering::SeqCst) {
                                        fail(&event_handle, "The local suite server stopped. Export any unsaved document you can, then close and reopen TLAL OS.");
                                    }
                                    break;
                                }
                                _ => {}
                            }
                        }
                        exited.store(true, Ordering::SeqCst);
                    });
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_secs(45));
                        if !ready.load(Ordering::SeqCst) {
                            fail(&handle, "The suite server did not become ready within 45 seconds. Close and reopen the application; check available disk space and execution permissions.");
                        }
                    });
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("could not initialize TLAL OS desktop");
    app.run(|handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            let state = handle.state::<Backend>();
            if !state.closing.swap(true, Ordering::SeqCst) {
                api.prevent_exit();
                let child = state.child.lock().unwrap().take();
                let exited = state.exited.clone();
                let app = handle.clone();
                std::thread::spawn(move || {
                    if let Some(mut process) = child {
                        // stdin control is not exposed to the web pages. EOF also stops the server.
                        let _ = process.write(b"shutdown\n");
                        let deadline = Instant::now() + Duration::from_secs(5);
                        while !exited.load(Ordering::SeqCst) && Instant::now() < deadline {
                            std::thread::sleep(Duration::from_millis(50));
                        }
                        if !exited.load(Ordering::SeqCst) { let _ = process.kill(); }
                    }
                    app.exit(0);
                });
            }
        }
    });
}
