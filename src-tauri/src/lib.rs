//! callsheet Tauri backend.
//!
//! Owns the SQLite store and exposes the CONTRACT.md command surface. All
//! commands return `Result<..., String>`.

mod colour_allocator;
mod db;

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

use db::{ActivityType, Card, CardInput, Template};

/// Tauri-managed state: a mutex-guarded SQLite connection plus the path it
/// was opened from, so a poisoned mutex can be recovered by reopening.
struct Store {
    conn: Mutex<Connection>,
    path: std::path::PathBuf,
}

impl Store {
    /// Lock the connection, recovering from a poisoned mutex by reopening the
    /// database from the stored path.
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        match self.conn.lock() {
            Ok(guard) => Ok(guard),
            Err(poisoned) => {
                let conn = db::open(&self.path).map_err(|e| e.to_string())?;
                *poisoned.into_inner() = conn;
                self.conn.lock().map_err(|e| e.to_string())
            }
        }
    }
}

/// Tracks whether the dock is currently visible (macOS). There is no getter
/// for the current activation policy, so we track it ourselves.
struct DockVisible(Mutex<bool>);

/// Show and focus the main window (used by tray click and macOS Reopen).
fn show_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(false).map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_cards(state: tauri::State<'_, Store>, date: String) -> Result<Vec<Card>, String> {
    db::validate_date(&date)?;
    let conn = state.lock()?;
    db::list_cards(&conn, &date).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_card(
    app: tauri::AppHandle,
    state: tauri::State<'_, Store>,
    card: CardInput,
) -> Result<Card, String> {
    db::validate_date(&card.date)?;
    let conn = state.lock()?;
    let saved = db::save_card(&conn, &card).map_err(|e| e.to_string())?;
    app.emit("cards-changed", ()).map_err(|e| e.to_string())?;
    Ok(saved)
}

#[tauri::command]
fn delete_card(
    app: tauri::AppHandle,
    state: tauri::State<'_, Store>,
    id: i64,
) -> Result<(), String> {
    let conn = state.lock()?;
    db::delete_card(&conn, id).map_err(|e| e.to_string())?;
    app.emit("cards-changed", ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn commit_ghost_card(
    app: tauri::AppHandle,
    state: tauri::State<'_, Store>,
    id: i64,
) -> Result<Card, String> {
    let conn = state.lock()?;
    let card = db::commit_ghost_card(&conn, id).map_err(|e| e.to_string())?;
    app.emit("cards-changed", ()).map_err(|e| e.to_string())?;
    Ok(card)
}

#[tauri::command]
fn propose_ghost_card(
    app: tauri::AppHandle,
    state: tauri::State<'_, Store>,
    date: String,
    activity_type_id: i64,
    markdown: String,
    source: String,
) -> Result<Card, String> {
    db::validate_date(&date)?;
    let conn = state.lock()?;
    let card = db::propose_ghost_card(&conn, &date, activity_type_id, &markdown, &source)
        .map_err(|e| e.to_string())?;
    app.emit("cards-changed", ()).map_err(|e| e.to_string())?;
    Ok(card)
}

#[tauri::command]
fn reorder_cards(
    state: tauri::State<'_, Store>,
    date: String,
    ids: Vec<i64>,
) -> Result<Vec<Card>, String> {
    db::validate_date(&date)?;
    let mut conn = state.lock()?;
    db::reorder_cards(&mut *conn, &date, &ids).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Activity types
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_activity_types(state: tauri::State<'_, Store>) -> Result<Vec<ActivityType>, String> {
    let conn = state.lock()?;
    db::list_activity_types(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_activity_type(
    state: tauri::State<'_, Store>,
    name: String,
) -> Result<ActivityType, String> {
    let conn = state.lock()?;
    db::create_activity_type(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_activity_type(state: tauri::State<'_, Store>, id: i64) -> Result<(), String> {
    let conn = state.lock()?;
    db::delete_activity_type(&conn, id)
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_templates(state: tauri::State<'_, Store>) -> Result<Vec<Template>, String> {
    let conn = state.lock()?;
    db::list_templates(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_template(
    state: tauri::State<'_, Store>,
    name: String,
    markdown: String,
    activity_type_id: i64,
) -> Result<Template, String> {
    let conn = state.lock()?;
    db::create_template(&conn, &name, &markdown, activity_type_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_template(state: tauri::State<'_, Store>, id: i64) -> Result<(), String> {
    let conn = state.lock()?;
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
    let conn = state.lock()?;
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
            show_main_window(&app)?;
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
            app.manage(Store {
                conn: Mutex::new(conn),
                path: db_path,
            });
            app.manage(DockVisible(Mutex::new(true)));

            // Menu-bar tray icon: the way back from "statusbar" mode.
            // Left-click shows the window; the menu offers Show / Quit.
            let show = MenuItem::with_id(app, "show", "Show Callsheet", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Callsheet", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let _tray = TrayIconBuilder::with_id("callsheet-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        let _ = show_main_window(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let _ = show_main_window(app);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_cards,
            save_card,
            delete_card,
            commit_ghost_card,
            propose_ghost_card,
            reorder_cards,
            list_activity_types,
            create_activity_type,
            delete_activity_type,
            list_templates,
            create_template,
            delete_template,
            update_template,
            set_window_presence,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                let _ = show_main_window(app_handle);
            }
        });
}
