use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

use walkdir::WalkDir;
use zip::ZipArchive;

use crate::errors::{PackagerError, Result};

pub const REQUIRED_EXPORT_FILES: [&str; 3] = ["index.html", "main.js", "package.bin"];

pub fn extract_zip(zip_path: &Path, destination: &Path) -> Result<()> {
    fs::create_dir_all(destination).map_err(|source| PackagerError::CreateDir {
        path: destination.to_path_buf(),
        source,
    })?;

    let file = fs::File::open(zip_path).map_err(|source| PackagerError::ReadFile {
        path: zip_path.to_path_buf(),
        source,
    })?;
    let mut archive = ZipArchive::new(file).map_err(|error| PackagerError::ZipOpen {
        path: zip_path.to_path_buf(),
        message: error.to_string(),
    })?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| PackagerError::ZipExtract {
                path: zip_path.to_path_buf(),
                message: error.to_string(),
            })?;
        let Some(safe_name) = entry.enclosed_name().map(PathBuf::from) else {
            return Err(PackagerError::UnsafeZipPath {
                path: zip_path.to_path_buf(),
                entry: entry.name().to_string(),
            });
        };

        if safe_name.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        }) {
            return Err(PackagerError::UnsafeZipPath {
                path: zip_path.to_path_buf(),
                entry: entry.name().to_string(),
            });
        }

        let output_path = destination.join(safe_name);

        if entry.name().ends_with('/') {
            fs::create_dir_all(&output_path).map_err(|source| PackagerError::CreateDir {
                path: output_path,
                source,
            })?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|source| PackagerError::CreateDir {
                path: parent.to_path_buf(),
                source,
            })?;
        }

        let mut output_file =
            fs::File::create(&output_path).map_err(|source| PackagerError::WriteFile {
                path: output_path.clone(),
                source,
            })?;
        io::copy(&mut entry, &mut output_file).map_err(|source| PackagerError::WriteFile {
            path: output_path,
            source,
        })?;
    }

    Ok(())
}

pub fn locate_export_root(extracted_root: &Path) -> Result<PathBuf> {
    let mut matches = Vec::new();

    for entry in WalkDir::new(extracted_root)
        .min_depth(0)
        .into_iter()
        .filter_map(std::result::Result::ok)
        .filter(|entry| entry.file_type().is_dir())
    {
        let directory = entry.path();
        let missing = missing_required_files(directory);
        if missing.is_empty() {
            matches.push(directory.to_path_buf());
        }
    }

    match matches.len() {
        0 => Err(PackagerError::ExportRootNotFound {
            path: extracted_root.to_path_buf(),
        }),
        1 => Ok(matches.remove(0)),
        _ => Err(PackagerError::AmbiguousExportRoot {
            path: extracted_root.to_path_buf(),
            matches,
        }),
    }
}

pub fn ensure_export_root(path: &Path) -> Result<()> {
    let missing = missing_required_files(path);
    if missing.is_empty() {
        Ok(())
    } else {
        Err(PackagerError::MissingRequiredFiles {
            path: path.to_path_buf(),
            missing,
        })
    }
}

fn missing_required_files(path: &Path) -> Vec<String> {
    REQUIRED_EXPORT_FILES
        .iter()
        .filter(|name| !path.join(name).is_file())
        .map(|name| (*name).to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;

    use tempfile::tempdir;
    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    use super::{ensure_export_root, extract_zip, locate_export_root};

    fn write_sample_zip(path: &std::path::Path, prefix: &str) {
        let file = fs::File::create(path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        for (name, contents) in [
            ("index.html", "<html></html>"),
            ("main.js", "console.log('hello');"),
            ("package.bin", "hello"),
        ] {
            let entry_name = if prefix.is_empty() {
                name.to_string()
            } else {
                format!("{prefix}/{name}")
            };
            zip.start_file(entry_name, options).unwrap();
            zip.write_all(contents.as_bytes()).unwrap();
        }

        zip.finish().unwrap();
    }

    #[test]
    fn finds_root_level_export() {
        let temp = tempdir().unwrap();
        let zip_path = temp.path().join("sample.zip");
        let extract_dir = temp.path().join("extract");
        write_sample_zip(&zip_path, "");

        extract_zip(&zip_path, &extract_dir).unwrap();
        let root = locate_export_root(&extract_dir).unwrap();

        assert_eq!(root, extract_dir);
        ensure_export_root(&root).unwrap();
    }

    #[test]
    fn finds_nested_export() {
        let temp = tempdir().unwrap();
        let zip_path = temp.path().join("sample.zip");
        let extract_dir = temp.path().join("extract");
        write_sample_zip(&zip_path, "nested/app");

        extract_zip(&zip_path, &extract_dir).unwrap();
        let root = locate_export_root(&extract_dir).unwrap();

        assert!(root.ends_with("nested/app"));
    }

    #[test]
    fn rejects_missing_files() {
        let temp = tempdir().unwrap();
        fs::create_dir_all(temp.path()).unwrap();
        fs::write(temp.path().join("index.html"), "ok").unwrap();
        fs::write(temp.path().join("main.js"), "ok").unwrap();

        let error = ensure_export_root(temp.path()).unwrap_err();
        assert!(error.to_string().contains("missing required files"));
    }
}
