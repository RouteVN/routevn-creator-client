use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tempfile::tempdir;

use crate::errors::{PackagerError, Result};
use crate::windows_resources::parse_windows_version_parts;

#[derive(Debug)]
pub struct InstallerRequest<'a> {
    pub exe_path: &'a Path,
    pub output_path: &'a Path,
    pub title: &'a str,
    pub version: &'a str,
    pub publisher: Option<&'a str>,
    pub makensis_path: Option<&'a Path>,
}

#[derive(Debug)]
pub struct InstallerOutcome {
    pub output_path: PathBuf,
}

pub fn build_nsis_installer(request: InstallerRequest<'_>) -> Result<InstallerOutcome> {
    if !cfg!(target_os = "windows") {
        return Err(PackagerError::UnsupportedInstallerHost {
            host: std::env::consts::OS.to_string(),
        });
    }

    if !request.exe_path.exists() {
        return Err(PackagerError::MissingRequiredFiles {
            path: request.exe_path.to_path_buf(),
            missing: vec!["protected Windows executable".to_string()],
        });
    }

    if let Some(parent) = request.output_path.parent() {
        fs::create_dir_all(parent).map_err(|source| PackagerError::CreateDir {
            path: parent.to_path_buf(),
            source,
        })?;
    }

    let temp = tempdir().map_err(|source| PackagerError::CreateDir {
        path: std::env::temp_dir(),
        source,
    })?;
    let script_path = temp.path().join("installer.nsi");
    let script = create_nsis_script(&request)?;
    fs::write(&script_path, script).map_err(|source| PackagerError::WriteFile {
        path: script_path.clone(),
        source,
    })?;

    let makensis = request
        .makensis_path
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("makensis.exe"));
    let output = Command::new(&makensis)
        .arg(&script_path)
        .output()
        .map_err(|source| PackagerError::SpawnCommand {
            program: makensis.display().to_string(),
            source,
        })?;

    if !output.status.success() {
        return Err(PackagerError::CommandFailed {
            program: makensis.display().to_string(),
            status: output.status,
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        });
    }

    Ok(InstallerOutcome {
        output_path: request.output_path.to_path_buf(),
    })
}

pub fn create_nsis_script(request: &InstallerRequest<'_>) -> Result<String> {
    let exe_name = request
        .exe_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| PackagerError::InvalidWindowsResource {
            path: request.exe_path.to_path_buf(),
            message: "installer executable file name is required".to_string(),
        })?;
    let publisher = request
        .publisher
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let title_path_segment =
        sanitize_nsis_path_segment(request.output_path, request.title, "title")?;
    let install_dir = if let Some(publisher) = publisher {
        format!(
            "$LOCALAPPDATA\\{}\\{}",
            sanitize_nsis_path_segment(request.output_path, publisher, "publisher")?,
            title_path_segment,
        )
    } else {
        format!("$LOCALAPPDATA\\{}", title_path_segment)
    };
    let company_version_key = publisher
        .map(|publisher| {
            format!(
                "VIAddVersionKey \"CompanyName\" \"{}\"\n",
                escape_nsis_string(publisher)
            )
        })
        .unwrap_or_default();
    let product_version = format_nsis_product_version(request.output_path, request.version)?;

    Ok(format!(
        r#"Unicode true
RequestExecutionLevel user
Name "{title}"
OutFile "{output_path}"
InstallDir "{install_dir}"
VIProductVersion "{product_version}"
VIAddVersionKey "ProductName" "{title}"
{company_version_key}
VIAddVersionKey "FileDescription" "{title} Setup"
VIAddVersionKey "FileVersion" "{file_version}"
VIAddVersionKey "ProductVersion" "{file_version}"
ShowInstDetails show
ShowUninstDetails show

Section "Install"
  SetOutPath "$INSTDIR"
  File "/oname={exe_name}" "{exe_path}"
  CreateShortcut "$SMPROGRAMS\{title}.lnk" "$INSTDIR\{exe_name}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\{title}.lnk"
  Delete "$INSTDIR\{exe_name}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
"#,
        title = escape_nsis_string(request.title),
        output_path = escape_nsis_string(&request.output_path.display().to_string()),
        install_dir = install_dir,
        product_version = product_version,
        company_version_key = company_version_key,
        file_version = escape_nsis_string(request.version),
        exe_name = escape_nsis_string(exe_name),
        exe_path = escape_nsis_string(&request.exe_path.display().to_string()),
    ))
}

fn escape_nsis_string(value: &str) -> String {
    value
        .replace('$', "$$")
        .replace('"', "$\\\"")
        .replace('\r', " ")
        .replace('\n', " ")
}

fn format_nsis_product_version(path: &Path, value: &str) -> Result<String> {
    let parts = parse_windows_version_parts(path, value)?;
    Ok(format!(
        "{}.{}.{}.{}",
        parts[0], parts[1], parts[2], parts[3]
    ))
}

fn sanitize_nsis_path_segment(path: &Path, value: &str, label: &str) -> Result<String> {
    let sanitized = value
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '$' => ' ',
            ch if ch.is_control() => ' ',
            ch => ch,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if sanitized.is_empty() {
        Err(PackagerError::InvalidWindowsResource {
            path: path.to_path_buf(),
            message: format!("installer {label} must contain at least one valid path character"),
        })
    } else {
        Ok(sanitized)
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{InstallerRequest, create_nsis_script};

    #[test]
    fn creates_project_specific_nsis_script() {
        let request = InstallerRequest {
            exe_path: Path::new("/build/My Game.exe"),
            output_path: Path::new("/dist/My Game Setup.exe"),
            title: "My Game",
            version: "1.2.3",
            publisher: Some("Studio Name"),
            makensis_path: None,
        };
        let script = create_nsis_script(&request).unwrap();

        assert!(script.contains("Name \"My Game\""));
        assert!(script.contains("OutFile \"/dist/My Game Setup.exe\""));
        assert!(script.contains("InstallDir \"$LOCALAPPDATA\\Studio Name\\My Game\""));
        assert!(script.contains("VIProductVersion \"1.2.3.0\""));
        assert!(script.contains("VIAddVersionKey \"CompanyName\" \"Studio Name\""));
        assert!(script.contains("File \"/oname=My Game.exe\" \"/build/My Game.exe\""));
        assert!(script.contains("CreateShortcut \"$SMPROGRAMS\\My Game.lnk\""));
        assert!(script.contains("WriteUninstaller \"$INSTDIR\\Uninstall.exe\""));
    }

    #[test]
    fn sanitizes_installer_path_segments_without_default_publisher() {
        let request = InstallerRequest {
            exe_path: Path::new("/build/Game.exe"),
            output_path: Path::new("/dist/Game Setup.exe"),
            title: "Bad:/Name",
            version: "2.5",
            publisher: None,
            makensis_path: None,
        };
        let script = create_nsis_script(&request).unwrap();

        assert!(script.contains("VIProductVersion \"2.5.0.0\""));
        assert!(script.contains("InstallDir \"$LOCALAPPDATA\\Bad Name\""));
        assert!(!script.contains("CompanyName"));
    }

    #[test]
    fn rejects_non_numeric_installer_version() {
        let request = InstallerRequest {
            exe_path: Path::new("/build/Game.exe"),
            output_path: Path::new("/dist/Game Setup.exe"),
            title: "Game",
            version: "2.5-beta",
            publisher: Some("Studio"),
            makensis_path: None,
        };

        assert!(create_nsis_script(&request).is_err());
    }
}
