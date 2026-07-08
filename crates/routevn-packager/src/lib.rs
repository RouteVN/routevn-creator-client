pub mod artifacts;
pub mod cli;
pub mod errors;
pub mod installer;
pub mod metadata;
pub mod payload;
pub mod targets;
pub mod tauri;
pub mod windows_resources;
pub mod zip;

pub use errors::{PackagerError, Result};

pub fn run() -> Result<()> {
    cli::run(std::env::args_os())
}

pub fn run_with_args<I, T>(args: I) -> Result<()>
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    cli::run(args)
}
