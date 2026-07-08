use std::fmt;

use clap::ValueEnum;
use serde::{Deserialize, Serialize};

use crate::errors::{PackagerError, Result};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize, ValueEnum)]
#[serde(rename_all = "lowercase")]
pub enum DesktopTarget {
    Linux,
    Macos,
    Windows,
}

impl fmt::Display for DesktopTarget {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = match self {
            Self::Linux => "linux",
            Self::Macos => "macos",
            Self::Windows => "windows",
        };

        f.write_str(value)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostPlatform {
    Linux,
    Macos,
    Windows,
}

impl HostPlatform {
    pub fn current() -> Self {
        match std::env::consts::OS {
            "linux" => Self::Linux,
            "macos" => Self::Macos,
            "windows" => Self::Windows,
            other => panic!("unsupported host operating system: {other}"),
        }
    }

    pub fn default_target(self) -> DesktopTarget {
        match self {
            Self::Linux => DesktopTarget::Linux,
            Self::Macos => DesktopTarget::Macos,
            Self::Windows => DesktopTarget::Windows,
        }
    }

    pub fn supports(self, target: DesktopTarget) -> bool {
        self.default_target() == target
    }
}

impl fmt::Display for HostPlatform {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = match self {
            Self::Linux => "linux",
            Self::Macos => "macos",
            Self::Windows => "windows",
        };

        f.write_str(value)
    }
}

pub fn resolve_targets(
    host: HostPlatform,
    requested: &[DesktopTarget],
) -> Result<Vec<DesktopTarget>> {
    let mut resolved = if requested.is_empty() {
        vec![host.default_target()]
    } else {
        requested.to_vec()
    };

    resolved.sort_unstable_by_key(|target| match target {
        DesktopTarget::Linux => 0,
        DesktopTarget::Macos => 1,
        DesktopTarget::Windows => 2,
    });
    resolved.dedup();

    for target in &resolved {
        if !host.supports(*target) {
            return Err(PackagerError::UnsupportedTarget {
                target: *target,
                host,
            });
        }
    }

    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::{DesktopTarget, HostPlatform, resolve_targets};

    #[test]
    fn defaults_to_host_target() {
        let resolved = resolve_targets(HostPlatform::Linux, &[]).unwrap();
        assert_eq!(resolved, vec![DesktopTarget::Linux]);
    }

    #[test]
    fn rejects_unsupported_cross_target() {
        let error = resolve_targets(HostPlatform::Linux, &[DesktopTarget::Windows]).unwrap_err();
        assert!(error.to_string().contains("not supported"));
    }

    #[test]
    fn deduplicates_targets() {
        let resolved = resolve_targets(
            HostPlatform::Linux,
            &[DesktopTarget::Linux, DesktopTarget::Linux],
        )
        .unwrap();

        assert_eq!(resolved, vec![DesktopTarget::Linux]);
    }
}
