//! callsheet Tauri backend.
//!
//! Owns the SQLite store and exposes the CONTRACT.md command surface. All
//! commands return `Result<..., String>`.

mod colour_allocator;
mod db;

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::Manager;

use db::{ActivityType, Card, CardInput, Template};

/// Tauri-managed state: a mutex-guarded SQLite connection.
struct Store(Mutex<Connection>);

/// Tracks whether the dock is currently visible (macOS). There is no getter
/// for the current activation policy, so we track it ourselves.
struct DockVisible(Mutex<bool>);

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_cards(state: tauri::State<'_, Store>, date: String) -> Result<Vec<Card>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::list_cards(&conn, &date).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_card(state: tauri::State<'_, Store>, card: CardInput) -> Result<Card, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::save_card(&conn, &card).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_card(state: tauri::State<'_, Store>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_card(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_card(state: tauri::State<'_, Store>, id: i64, new_position: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::move_card(&conn, id, new_position).map_err(|e| e.to_string())
}

#[tauri::command]
fn commit_ghost_card(state: tauri::State<'_, Store>, id: i64) -> Result<Card, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::commit_ghost_card(&conn, id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Activity types
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_activity_types(state: tauri::State<'_, Store>) -> Result<Vec<ActivityType>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::list_activity_types(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_activity_type(
    state: tauri::State<'_, Store>,
    name: String,
) -> Result<ActivityType, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::create_activity_type(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_activity_type(state: tauri::State<'_, Store>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_activity_type(&conn, id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_templates(state: tauri::State<'_, Store>) -> Result<Vec<Template>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::list_templates(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_template(
    state: tauri::State<'_, Store>,
    name: String,
    markdown: String,
    activity_type_id: i64,
) -> Result<Template, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::create_template(&conn, &name, &markdown, activity_type_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_template(state: tauri::State<'_, Store>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_template(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_template(
    state: tauri::State<'_, Store>,
    id: i64,
    name: String,
    markdown: String,
    activity_type_id: i64,
) -> Result<Template, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::update_template(&conn, id, &name, &markdown, activity_type_id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Window presence
// ---------------------------------------------------------------------------

/// Set the window presence mode.
///
/// - "normal"   → show the window, unminimize, always-on-top off (never floats).
/// - "statusbar"→ hide the window (minimise to menu bar).
/// - "dock"     → toggle dock visibility (macOS only; no-op elsewhere).
#[tauri::command]
fn set_window_presence(
    app: tauri::AppHandle,
    state_dock: tauri::State<'_, DockVisible>,
    mode: String,
) -> Result<(), String> {
    match mode.as_str() {
        "normal" => {
            if let Some(window) = app.get_webview_window("main") {
                window.set_always_on_top(false).map_err(|e| e.to_string())?;
                window.unminimize().map_err(|e| e.to_string())?;
                window.show().map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        "statusbar" => {
            if let Some(window) = app.get_webview_window("main") {
                window.hide().map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        "dock" => {
            #[cfg(target_os = "macos")]
            {
                use tauri::ActivationPolicy;
                let mut dock = state_dock.0.lock().map_err(|e| e.to_string())?;
                let next = if *dock {
                    ActivationPolicy::Accessory
                } else {
                    ActivationPolicy::Regular
                };
                app.set_activation_policy(next).map_err(|e| e.to_string())?;
                *dock = !*dock;
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (&app, &state_dock);
            }
            Ok(())
        }
        other => Err(format!("unknown window presence mode: {}", other)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("failed to resolve app data dir: {}", e))?;
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("failed to create app data dir: {}", e))?;
            let db_path = data_dir.join("callsheet.db");
            let conn = db::open(&db_path)
                .map_err(|e| format!("failed to open database: {}", e))?;
            app.manage(Store(Mutex::new(conn)));
            app.manage(DockVisible(Mutex::new(true)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_cards,
            save_card,
            delete_card,
            move_card,
            commit_ghost_card,
            list_activity_types,
            create_activity_type,
            delete_activity_type,
            list_templates,
            create_template,
            delete_template,
            update_template,
            set_window_presence,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
