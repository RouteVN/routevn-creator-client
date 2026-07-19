use discord_rich_presence::{
    DiscordIpc, DiscordIpcClient,
    activity::{Activity, ActivityType, Timestamps},
};
use std::{
    sync::mpsc::{self, Receiver, RecvTimeoutError, Sender},
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::State;

const DISCORD_APPLICATION_ID: &str = "1528049917627732018";
const DISCORD_RECONNECT_INTERVAL: Duration = Duration::from_secs(15);
const DISCORD_SHUTDOWN_TIMEOUT: Duration = Duration::from_millis(250);
const DISCORD_SHUTDOWN_POLL_INTERVAL: Duration = Duration::from_millis(10);

pub struct DiscordPresenceState {
    command_tx: Option<Sender<DiscordPresenceCommand>>,
    worker: Option<JoinHandle<()>>,
}

enum DiscordPresenceCommand {
    SetDetails(String),
    Shutdown,
}

impl DiscordPresenceState {
    pub fn new() -> Self {
        let (command_tx, command_rx) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("discord-presence".to_string())
            .spawn(move || run_discord_presence(command_rx));
        let worker = match worker {
            Ok(worker) => Some(worker),
            Err(error) => {
                eprintln!("[discord_presence] failed to start worker: {error}");
                None
            }
        };

        Self {
            command_tx: Some(command_tx),
            worker,
        }
    }

    fn set_details(&self, details: String) -> Result<(), String> {
        let Some(command_tx) = &self.command_tx else {
            return Err("Discord presence worker is unavailable.".to_string());
        };

        command_tx
            .send(DiscordPresenceCommand::SetDetails(details))
            .map_err(|_| "Discord presence worker is unavailable.".to_string())
    }
}

impl Drop for DiscordPresenceState {
    fn drop(&mut self) {
        if let Some(command_tx) = self.command_tx.take() {
            let _ = command_tx.send(DiscordPresenceCommand::Shutdown);
        }
        if let Some(worker) = self.worker.take()
            && !join_worker_with_timeout(worker, DISCORD_SHUTDOWN_TIMEOUT)
        {
            eprintln!("[discord_presence] worker did not stop before shutdown timeout");
        }
    }
}

fn join_worker_with_timeout(worker: JoinHandle<()>, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while !worker.is_finished() {
        let now = Instant::now();
        if now >= deadline {
            return false;
        }

        thread::sleep(DISCORD_SHUTDOWN_POLL_INTERVAL.min(deadline - now));
    }

    let _ = worker.join();
    true
}

#[tauri::command]
pub fn set_discord_presence_details(
    details: String,
    state: State<'_, DiscordPresenceState>,
) -> Result<(), String> {
    state.set_details(details)
}

fn run_discord_presence(command_rx: Receiver<DiscordPresenceCommand>) {
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default();
    let mut client = DiscordIpcClient::new(DISCORD_APPLICATION_ID);
    let mut connected = false;
    let mut details = None;
    let mut activity_dirty = false;

    loop {
        if details.is_some() && !connected {
            connected = client.connect().is_ok();
            activity_dirty = connected;
        }

        if let Some(details) = details.as_deref()
            && connected
            && activity_dirty
            && client
                .set_activity(create_activity(started_at, details))
                .is_err()
        {
            let _ = client.close();
            connected = false;
        }

        if connected {
            activity_dirty = false;
        }

        let command = if connected || details.is_none() {
            match command_rx.recv() {
                Ok(command) => Some(command),
                Err(_) => break,
            }
        } else {
            match command_rx.recv_timeout(DISCORD_RECONNECT_INTERVAL) {
                Ok(command) => Some(command),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => break,
            }
        };

        match command {
            Some(DiscordPresenceCommand::SetDetails(next_details)) => {
                details = Some(next_details);
                activity_dirty = true;
            }
            Some(DiscordPresenceCommand::Shutdown) => break,
            None => {}
        }
    }

    if connected {
        let _ = client.clear_activity();
        let _ = client.close();
    }
}

fn create_activity<'a>(started_at: i64, details: &'a str) -> Activity<'a> {
    Activity::new()
        .activity_type(ActivityType::Playing)
        .details(details)
        .timestamps(Timestamps::new().start(started_at))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_the_routevn_creator_activity() {
        let activity =
            serde_json::to_value(create_activity(1_234, "Localized presence details")).unwrap();

        assert_eq!(activity["type"], 0);
        assert_eq!(activity["details"], "Localized presence details");
        assert!(activity.get("state").is_none());
        assert_eq!(activity["timestamps"]["start"], 1_234);
    }

    #[test]
    fn bounded_join_returns_for_a_stuck_worker() {
        let (release_tx, release_rx) = mpsc::channel();
        let worker = thread::spawn(move || {
            let _ = release_rx.recv();
        });

        assert!(!join_worker_with_timeout(worker, Duration::from_millis(20)));
        let _ = release_tx.send(());
    }

    #[test]
    fn bounded_join_reaps_a_finished_worker() {
        let worker = thread::spawn(|| {});

        assert!(join_worker_with_timeout(worker, Duration::from_secs(1)));
    }
}
