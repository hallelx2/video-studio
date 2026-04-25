use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::config::{self, Config};
use crate::projects::{scan_org_projects, ProductInfo};
use crate::sidecar::{spawn_agent, AgentRequest};

#[derive(Serialize, Deserialize, Debug)]
pub struct GenerateVideoArgs {
    pub product: String,
    pub formats: Vec<String>,
    #[serde(default)]
    pub composition_id: Option<String>,
}

#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<ProductInfo>, String> {
    let config = config::load(&app).map_err(|e| e.to_string())?;
    let org_path = config
        .org_projects_path
        .clone()
        .ok_or_else(|| "No projects folder configured. Open Settings to pick one.".to_string())?;
    scan_org_projects(&org_path, config.obsidian_outreach_path.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_video(app: AppHandle, args: GenerateVideoArgs) -> Result<(), String> {
    let request = AgentRequest::GenerateVideo {
        product: args.product,
        formats: args.formats,
        composition_id: args.composition_id,
    };
    spawn_agent(app, request).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn respond_to_prompt(prompt_id: String, response: String) -> Result<(), String> {
    crate::sidecar::send_prompt_response(&prompt_id, &response).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_studio_path(app: AppHandle) -> String {
    let config = config::load(&app).unwrap_or_default();
    config::studio_path_or_default(&app, &config)
}

#[tauri::command]
pub fn open_output_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<Config, String> {
    config::load(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: Config) -> Result<(), String> {
    config::save(&app, &config).map_err(|e| e.to_string())
}

/// Open a native folder picker dialog and return the selected path.
/// Returns None if the user cancelled.
#[tauri::command]
pub async fn pick_folder(app: AppHandle, title: Option<String>) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();

    let mut dialog = app.dialog().file();
    if let Some(t) = title {
        dialog = dialog.set_title(&t);
    }

    dialog.pick_folder(move |path| {
        let result = path.map(|p| p.to_string());
        let _ = tx.send(result);
    });

    rx.await.map_err(|e| e.to_string())
}
