use std::fs;
use std::path::{Path, PathBuf};

use crate::errors::{PackagerError, Result};
use crate::metadata::ResolvedMetadata;
use crate::targets::DesktopTarget;

#[derive(Clone, Debug)]
pub struct PackagedArtifact {
    pub target: DesktopTarget,
    pub source_path: PathBuf,
    pub output_path: PathBuf,
}

pub fn collect_artifacts(
    build_dir: &Path,
    out_dir: &Path,
    target: DesktopTarget,
    metadata: &ResolvedMetadata,
) -> Result<Vec<PackagedArtifact>> {
    let release_dir = build_dir.join("target").join("release");
    let bundle_dir = release_dir.join("bundle");
    let target_out_dir = out_dir.join(target.to_string());
    fs::create_dir_all(&target_out_dir).map_err(|source| PackagerError::CreateDir {
        path: target_out_dir.clone(),
        source,
    })?;

    let mut copied = Vec::new();

    if bundle_dir.is_dir() {
        let bundle_out_dir = target_out_dir.join("bundle");
        copy_dir_recursive(&bundle_dir, &bundle_out_dir, &mut copied, target)?;
    }

    let binary_name = match target {
        DesktopTarget::Windows => format!("{}.exe", metadata.binary_name),
        DesktopTarget::Linux | DesktopTarget::Macos => metadata.binary_name.clone(),
    };
    let binary_path = release_dir.join(&binary_name);
    if binary_path.is_file() {
        let binary_out_dir = target_out_dir.join("bin");
        fs::create_dir_all(&binary_out_dir).map_err(|source| PackagerError::CreateDir {
            path: binary_out_dir.clone(),
            source,
        })?;
        let destination = binary_out_dir.join(&binary_name);
        fs::copy(&binary_path, &destination).map_err(|source| PackagerError::Copy {
            from: binary_path.clone(),
            to: destination.clone(),
            source,
        })?;
        copied.push(PackagedArtifact {
            target,
            source_path: binary_path,
            output_path: destination,
        });
    }

    if copied.is_empty() {
        return Err(PackagerError::NoArtifactsFound { path: release_dir });
    }

    Ok(copied)
}

fn copy_dir_recursive(
    source: &Path,
    destination: &Path,
    copied: &mut Vec<PackagedArtifact>,
    target: DesktopTarget,
) -> Result<()> {
    fs::create_dir_all(destination).map_err(|source_error| PackagerError::CreateDir {
        path: destination.to_path_buf(),
        source: source_error,
    })?;

    for entry in fs::read_dir(source).map_err(|source_error| PackagerError::ReadFile {
        path: source.to_path_buf(),
        source: source_error,
    })? {
        let entry = entry.map_err(|source_error| PackagerError::ReadFile {
            path: source.to_path_buf(),
            source: source_error,
        })?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());

        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &destination_path, copied, target)?;
        } else {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent).map_err(|source_error| PackagerError::CreateDir {
                    path: parent.to_path_buf(),
                    source: source_error,
                })?;
            }

            fs::copy(&source_path, &destination_path).map_err(|source_error| {
                PackagerError::Copy {
                    from: source_path.clone(),
                    to: destination_path.clone(),
                    source: source_error,
                }
            })?;
            copied.push(PackagedArtifact {
                target,
                source_path,
                output_path: destination_path,
            });
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::collect_artifacts;
    use crate::metadata::ResolvedMetadata;
    use crate::targets::DesktopTarget;

    #[test]
    fn copies_binary_and_bundle_outputs() {
        let temp = tempdir().unwrap();
        let build_dir = temp.path().join("build");
        let release_dir = build_dir.join("target/release");
        let bundle_dir = release_dir.join("bundle/deb");
        fs::create_dir_all(&bundle_dir).unwrap();
        fs::write(release_dir.join("sample-app"), "bin").unwrap();
        fs::write(bundle_dir.join("sample.deb"), "deb").unwrap();

        let out_dir = temp.path().join("out");
        let artifacts = collect_artifacts(
            &build_dir,
            &out_dir,
            DesktopTarget::Linux,
            &ResolvedMetadata {
                title: "Sample App".to_string(),
                identifier: "vn.routevn.sample-app".to_string(),
                version: "0.1.0".to_string(),
                icon: None,
                binary_name: "sample-app".to_string(),
            },
        )
        .unwrap();

        assert!(
            artifacts
                .iter()
                .any(|artifact| artifact.output_path.ends_with("sample-app"))
        );
        assert!(
            artifacts
                .iter()
                .any(|artifact| artifact.output_path.ends_with("sample.deb"))
        );
    }
}
