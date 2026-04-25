use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProductInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub has_readme: bool,
    pub has_launch_post: bool,
    pub description: Option<String>,
}

/// Scan `organisation-projects/` for product folders.
/// A folder counts as a product if it contains a README.md or package.json.
pub fn scan_org_projects(root: &str, outreach_root: Option<&str>) -> Result<Vec<ProductInfo>> {
    let root_path = Path::new(root);
    if !root_path.exists() {
        return Ok(Vec::new());
    }

    let mut products = Vec::new();

    for entry in fs::read_dir(root_path).with_context(|| format!("reading {}", root))? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        let path = entry.path();
        let id = entry.file_name().to_string_lossy().to_string();

        // Skip hidden dirs and obvious non-projects
        if id.starts_with('.') || id == "node_modules" {
            continue;
        }

        let readme = path.join("README.md");
        let pkg = path.join("package.json");
        let has_readme = readme.exists();

        if !has_readme && !pkg.exists() {
            continue;
        }

        let description = if has_readme {
            extract_readme_tagline(&readme).ok()
        } else {
            None
        };

        let has_launch_post = check_launch_post(&id, outreach_root);

        products.push(ProductInfo {
            id: id.clone(),
            name: humanize(&id),
            path: path.display().to_string(),
            has_readme,
            has_launch_post,
            description,
        });
    }

    products.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(products)
}

fn extract_readme_tagline(readme_path: &Path) -> Result<String> {
    let content = fs::read_to_string(readme_path)?;
    // Skip H1 headings and badges; find the first paragraph of prose
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('[') || trimmed.starts_with('!') || trimmed.starts_with('<') {
            continue;
        }
        // Take the first real sentence or line, up to 200 chars
        let out: String = trimmed.chars().take(200).collect();
        return Ok(out);
    }
    Ok(String::new())
}

fn check_launch_post(product_id: &str, outreach_root: Option<&str>) -> bool {
    let Some(outreach) = outreach_root else { return false };
    let candidate = Path::new(outreach)
        .join(product_id)
        .join("posts")
        .join("01-launch-day-founder-post.md");
    candidate.exists()
}

fn humanize(id: &str) -> String {
    id.replace('-', " ")
        .split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(first) => first.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
