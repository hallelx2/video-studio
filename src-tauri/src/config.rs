use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct Config {
    /// Absolute path to the folder containing product repos (e.g. organisation-projects)
    pub org_projects_path: Option<String>,

    /// Absolute path to the obsidian outreach folder for voice references
    pub obsidian_outreach_path: Option<String>,

    /// Absolute path to the Remotion studio workspace
    pub studio_path: Option<String>,

    /// Default edge-tts voice name (e.g. en-US-AndrewNeural)
    pub tts_voice: Option<String>,

    /// Default formats to render when generating a video
    pub default_formats: Vec<String>,

    /// True after the user completes the onboarding flow
    pub onboarding_complete: bool,
}

impl Config {
    pub fn default_voice() -> &'static str {
        "en-US-AndrewNeural"
    }

    pub fn default_formats() -> Vec<String> {
        vec!["linkedin".to_string(), "x".to_string()]
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .context("failed to resolve app config dir")?;
    fs::create_dir_all(&dir).with_context(|| format!("failed to create {}", dir.display()))?;
    Ok(dir.join("config.json"))
}

pub fn load(app: &AppHandle) -> Result<Config> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(Config::default());
    }
    let content = fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let config: Config = serde_json::from_str(&content)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    Ok(config)
}

pub fn save(app: &AppHandle, config: &Config) -> Result<()> {
    let path = config_path(app)?;
    let content = serde_json::to_string_pretty(config)?;
    fs::write(&path, content).with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

/// Get the studio path, with a sensible default fallback for dev mode.
pub fn studio_path_or_default(app: &AppHandle, config: &Config) -> String {
    if let Some(p) = &config.studio_path {
        return p.clone();
    }

    // Dev fallback: studio next to src-tauri
    if let Ok(cwd) = std::env::current_dir() {
        let dev_path = cwd.join("..").join("studio");
        if dev_path.exists() {
            return dev_path.display().to_string();
        }
    }

    // Bundled fallback: studio next to the resource dir
    if let Ok(resource) = app.path().resource_dir() {
        let bundled = resource.join("studio");
        if bundled.exists() {
            return bundled.display().to_string();
        }
    }

    "../studio".to_string()
}
