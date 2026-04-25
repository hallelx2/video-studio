use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Active sidecar process. We only track ONE generate task at a time for v0.1.
static ACTIVE_CHILD: Mutex<Option<CommandChild>> = Mutex::new(None);

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
pub enum AgentRequest {
    GenerateVideo {
        product: String,
        formats: Vec<String>,
        #[serde(rename = "compositionId")]
        composition_id: Option<String>,
    },
}

/// Spawn the bundled agent sidecar (Bun-compiled, ships inside the Tauri app).
/// Stream its stdout/stderr back to the frontend as Tauri events.
pub async fn spawn_agent(app: AppHandle, request: AgentRequest) -> Result<()> {
    let config = crate::config::load(&app).unwrap_or_default();
    let studio_path = crate::config::studio_path_or_default(&app, &config);
    let voice = config
        .tts_voice
        .clone()
        .unwrap_or_else(|| "en-US-AndrewNeural".to_string());

    let (command_arg, payload) = match request {
        AgentRequest::GenerateVideo {
            product,
            formats,
            composition_id,
        } => {
            let json = serde_json::json!({
                "product": product,
                "formats": formats,
                "compositionId": composition_id,
            });
            ("generate-video".to_string(), json.to_string())
        }
    };

    let mut sidecar = app
        .shell()
        .sidecar("agent")
        .context("failed to resolve agent sidecar")?
        .args([command_arg, payload])
        .env("VIDEO_STUDIO_STUDIO_PATH", &studio_path)
        .env("TTS_VOICE", &voice);

    if let Some(org) = &config.org_projects_path {
        sidecar = sidecar.env("ORG_PROJECTS_PATH", org);
    }
    if let Some(out) = &config.obsidian_outreach_path {
        sidecar = sidecar.env("OBSIDIAN_OUTREACH_PATH", out);
    }

    let (mut rx, child) = sidecar.spawn().context("failed to spawn agent sidecar")?;

    {
        let mut guard = ACTIVE_CHILD.lock().unwrap();
        *guard = Some(child);
    }

    let app_for_events = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes).to_string();
                    for raw in line.lines() {
                        let parsed: serde_json::Value = serde_json::from_str(raw)
                            .unwrap_or_else(|_| serde_json::json!({ "type": "raw", "text": raw }));
                        let _ = app_for_events.emit("agent-event", parsed);
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes).to_string();
                    let _ = app_for_events.emit(
                        "agent-log",
                        serde_json::json!({ "level": "stderr", "text": text }),
                    );
                }
                CommandEvent::Terminated(payload) => {
                    let _ = app_for_events.emit(
                        "agent-log",
                        serde_json::json!({
                            "level": "terminated",
                            "code": payload.code,
                        }),
                    );
                    let mut guard = ACTIVE_CHILD.lock().unwrap();
                    *guard = None;
                    break;
                }
                CommandEvent::Error(err) => {
                    let _ = app_for_events.emit(
                        "agent-log",
                        serde_json::json!({ "level": "error", "text": err }),
                    );
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Called from the frontend after the user answers a prompt message from the agent.
/// Writes a single JSON line to the agent's stdin.
pub fn send_prompt_response(prompt_id: &str, response: &str) -> Result<()> {
    let mut guard = ACTIVE_CHILD.lock().unwrap();
    let child = guard.as_mut().context("no active agent sidecar")?;

    let line = serde_json::json!({
        "type": "prompt-response",
        "id": prompt_id,
        "response": response,
    });
    let mut data = line.to_string();
    data.push('\n');

    child.write(data.as_bytes()).context("failed to write to agent stdin")?;
    Ok(())
}
