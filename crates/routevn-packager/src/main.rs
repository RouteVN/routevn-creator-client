fn main() {
    if let Err(error) = routevn_packager::run() {
        if let routevn_packager::PackagerError::Clap(clap_error) = &error {
            use clap::error::ErrorKind;

            if matches!(
                clap_error.kind(),
                ErrorKind::DisplayHelp | ErrorKind::DisplayVersion
            ) {
                clap_error.print().expect("failed to print clap help");
                return;
            }
        }

        eprintln!("error: {error}");

        let mut source = std::error::Error::source(&error);
        while let Some(cause) = source {
            eprintln!("caused by: {cause}");
            source = cause.source();
        }

        std::process::exit(1);
    }
}
