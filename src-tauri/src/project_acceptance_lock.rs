use std::collections::HashMap;
use std::fs::{File, OpenOptions, TryLockError};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

struct Owner {
    id: String,
    _file: File,
}

#[derive(Default)]
pub struct ProjectAcceptanceLocks(Mutex<HashMap<PathBuf, Owner>>);

impl ProjectAcceptanceLocks {
    pub fn canonical_path(path: &Path) -> Result<PathBuf, String> {
        let path = path.canonicalize().map_err(|error| error.to_string())?;
        if !path.is_dir() {
            return Err("Project path must be a directory".into());
        }
        Ok(path)
    }

    pub fn acquire(&self, path: &Path, owner_id: &str) -> Result<bool, String> {
        let path = Self::canonical_path(path)?;
        let mut owners = self.0.lock().map_err(|error| error.to_string())?;
        if let Some(owner) = owners.get(&path) {
            return Ok(owner.id == owner_id);
        }
        // Keep the inode stable. Existence is never evidence of ownership.
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path.join("project.acceptance.lock"))
            .map_err(|error| error.to_string())?;
        match file.try_lock() {
            Ok(()) => {
                owners.insert(
                    path,
                    Owner {
                        id: owner_id.to_owned(),
                        _file: file,
                    },
                );
                Ok(true)
            }
            Err(TryLockError::WouldBlock) => Ok(false),
            Err(TryLockError::Error(error)) => Err(error.to_string()),
        }
    }

    pub fn release(&self, path: &Path, owner_id: &str) -> Result<(), String> {
        let path = Self::canonical_path(path)?;
        let mut owners = self.0.lock().map_err(|error| error.to_string())?;
        if owners.get(&path).is_some_and(|owner| owner.id == owner_id) {
            // Closing the handle releases the OS lock, including on process exit.
            owners.remove(&path);
        }
        Ok(())
    }

    pub fn release_window(&self, label: &str) {
        if let Ok(mut owners) = self.0.lock() {
            let prefix = format!("{label}:");
            owners.retain(|_, owner| !owner.id.starts_with(&prefix));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ownership_survives_operation_boundaries_and_requires_matching_release() {
        let path = std::env::temp_dir().join(format!("routevn-lock-test-{}", std::process::id()));
        std::fs::create_dir_all(&path).unwrap();
        let first = ProjectAcceptanceLocks::default();
        let second = ProjectAcceptanceLocks::default();
        assert!(first.acquire(&path, "one").unwrap());
        assert!(first.acquire(&path.join("."), "one").unwrap());
        assert!(!first.acquire(&path, "two").unwrap());
        assert!(!second.acquire(&path, "two").unwrap());
        first.release(&path, "wrong").unwrap();
        assert!(!second.acquire(&path, "two").unwrap());
        let child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--ignored",
                "--exact",
                "tests::other_process_cannot_acquire",
            ])
            .env("ROUTEVN_LOCK_TEST_PATH", &path)
            .status()
            .unwrap();
        assert!(child.success());
        first.release(&path, "one").unwrap();
        assert!(second.acquire(&path, "two").unwrap());
        drop(second);
        assert!(first.acquire(&path, "one").unwrap());
        first.release(&path, "one").unwrap();
        assert!(path.join("project.acceptance.lock").exists());
        std::fs::remove_dir_all(path).unwrap();
    }

    #[test]
    #[ignore = "invoked by the parent ownership test with an active lock"]
    fn other_process_cannot_acquire() {
        let path = std::env::var_os("ROUTEVN_LOCK_TEST_PATH").unwrap();
        assert!(!ProjectAcceptanceLocks::default()
            .acquire(Path::new(&path), "child")
            .unwrap());
    }

    #[test]
    fn closing_a_window_releases_only_its_owned_projects() {
        let path =
            std::env::temp_dir().join(format!("routevn-window-lock-test-{}", std::process::id()));
        std::fs::create_dir_all(&path).unwrap();
        let owner = ProjectAcceptanceLocks::default();
        let contender = ProjectAcceptanceLocks::default();
        assert!(owner.acquire(&path, "window-one:owner").unwrap());
        owner.release_window("window-two");
        assert!(!contender.acquire(&path, "two").unwrap());
        owner.release_window("window-one");
        assert!(contender.acquire(&path, "two").unwrap());
        contender.release(&path, "two").unwrap();
        std::fs::remove_dir_all(path).unwrap();
    }
}
