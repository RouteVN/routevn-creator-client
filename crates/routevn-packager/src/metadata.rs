use std::fs;
use std::path::{Path, PathBuf};

use semver::Version;
use serde::{Deserialize, Serialize};

use crate::errors::{PackagerError, Result};
use crate::targets::DesktopTarget;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct PackagerConfig {
    pub title: Option<String>,
    pub identifier: Option<String>,
    pub version: Option<String>,
    pub icon: Option<PathBuf>,
    pub targets: Option<Vec<DesktopTarget>>,
}

#[derive(Clone, Debug, Default)]
pub struct MetadataOverrides {
    pub title: Option<String>,
    pub identifier: Option<String>,
    pub version: Option<String>,
    pub icon: Option<PathBuf>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedMetadata {
    pub title: String,
    pub identifier: String,
    pub version: String,
    pub icon: Option<PathBuf>,
    pub binary_name: String,
}

impl PackagerConfig {
    pub fn load(path: &Path) -> Result<Self> {
        let contents = fs::read_to_string(path).map_err(|source| PackagerError::ReadFile {
            path: path.to_path_buf(),
            source,
        })?;

        let mut config = match path.extension().and_then(|extension| extension.to_str()) {
            Some("json") => serde_json::from_str::<PackagerConfig>(&contents).map_err(|error| {
                PackagerError::ConfigParse {
                    path: path.to_path_buf(),
                    message: error.to_string(),
                }
            })?,
            Some("toml") => toml::from_str::<PackagerConfig>(&contents).map_err(|error| {
                PackagerError::ConfigParse {
                    path: path.to_path_buf(),
                    message: error.to_string(),
                }
            })?,
            _ => {
                return Err(PackagerError::UnsupportedConfigFormat {
                    path: path.to_path_buf(),
                });
            }
        };

        if let Some(icon) = config.icon.take() {
            let resolved = if icon.is_absolute() {
                icon
            } else {
                path.parent().unwrap_or_else(|| Path::new(".")).join(icon)
            };
            let resolved =
                fs::canonicalize(&resolved).map_err(|source| PackagerError::Canonicalize {
                    path: resolved,
                    source,
                })?;
            config.icon = Some(resolved);
        }

        Ok(config)
    }
}

impl ResolvedMetadata {
    pub fn resolve(
        zip_path: &Path,
        config: Option<&PackagerConfig>,
        overrides: &MetadataOverrides,
    ) -> Result<Self> {
        let config = config.cloned().unwrap_or_default();

        let title = overrides
            .title
            .clone()
            .or(config.title)
            .unwrap_or_else(|| default_title(zip_path));

        let identifier = overrides
            .identifier
            .clone()
            .or(config.identifier)
            .unwrap_or_else(|| default_identifier(&title));
        validate_identifier(&identifier)?;

        let version = overrides
            .version
            .clone()
            .or(config.version)
            .unwrap_or_else(|| "0.1.0".to_string());
        validate_version(&version)?;

        let icon = overrides.icon.clone().or(config.icon);
        let binary_name = default_binary_name(&title);

        Ok(Self {
            title,
            identifier,
            version,
            icon,
            binary_name,
        })
    }
}

fn validate_identifier(identifier: &str) -> Result<()> {
    let valid = identifier
        .split('.')
        .all(|segment| !segment.is_empty() && is_valid_identifier_segment(segment))
        && identifier.split('.').count() >= 2;

    if valid {
        Ok(())
    } else {
        Err(PackagerError::InvalidIdentifier {
            identifier: identifier.to_string(),
        })
    }
}

fn is_valid_identifier_segment(segment: &str) -> bool {
    let mut chars = segment.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    if !first.is_ascii_alphabetic() {
        return false;
    }

    chars.all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn validate_version(version: &str) -> Result<()> {
    Version::parse(version).map_err(|error| PackagerError::InvalidVersion {
        version: version.to_string(),
        message: error.to_string(),
    })?;

    Ok(())
}

fn default_title(zip_path: &Path) -> String {
    zip_path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(humanize_slug)
        .unwrap_or_else(|| "RouteVN App".to_string())
}

fn default_identifier(title: &str) -> String {
    format!("vn.routevn.{}", slugify(title))
}

fn default_binary_name(title: &str) -> String {
    slugify(title)
}

fn humanize_slug(raw: &str) -> String {
    let mut words = Vec::new();
    for word in raw
        .split(|character: char| character == '-' || character == '_' || character.is_whitespace())
        .filter(|segment| !segment.is_empty())
    {
        let mut characters = word.chars();
        let Some(first) = characters.next() else {
            continue;
        };

        let mut title_word = first.to_uppercase().collect::<String>();
        title_word.push_str(&characters.as_str().to_lowercase());
        words.push(title_word);
    }

    if words.is_empty() {
        "RouteVN App".to_string()
    } else {
        words.join(" ")
    }
}

fn slugify(raw: &str) -> String {
    let slug = raw
        .chars()
        .map(|character| match character {
            'A'..='Z' => character.to_ascii_lowercase(),
            'a'..='z' | '0'..='9' => character,
            _ => '-',
        })
        .collect::<String>();

    let slug = slug
        .split('-')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if slug.is_empty() {
        "routevn-app".to_string()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{MetadataOverrides, PackagerConfig, ResolvedMetadata};

    #[test]
    fn cli_overrides_win_over_config() {
        let config = PackagerConfig {
            title: Some("Config Title".to_string()),
            identifier: Some("vn.routevn.config-title".to_string()),
            version: Some("1.2.3".to_string()),
            icon: None,
            targets: None,
        };
        let overrides = MetadataOverrides {
            title: Some("CLI Title".to_string()),
            identifier: Some("vn.routevn.cli-title".to_string()),
            version: Some("2.0.0".to_string()),
            icon: None,
        };

        let metadata =
            ResolvedMetadata::resolve(Path::new("sample-export.zip"), Some(&config), &overrides)
                .unwrap();

        assert_eq!(metadata.title, "CLI Title");
        assert_eq!(metadata.identifier, "vn.routevn.cli-title");
        assert_eq!(metadata.version, "2.0.0");
        assert_eq!(metadata.binary_name, "cli-title");
    }

    #[test]
    fn defaults_from_zip_name() {
        let metadata = ResolvedMetadata::resolve(
            Path::new("my_cool-game.zip"),
            None,
            &MetadataOverrides::default(),
        )
        .unwrap();

        assert_eq!(metadata.title, "My Cool Game");
        assert_eq!(metadata.identifier, "vn.routevn.my-cool-game");
        assert_eq!(metadata.version, "0.1.0");
    }

    #[test]
    fn invalid_identifier_is_rejected() {
        let error = ResolvedMetadata::resolve(
            Path::new("sample.zip"),
            Some(&PackagerConfig {
                title: None,
                identifier: Some("bad identifier".to_string()),
                version: None,
                icon: None,
                targets: None,
            }),
            &MetadataOverrides::default(),
        )
        .unwrap_err();

        assert!(error.to_string().contains("invalid identifier"));
    }
}
