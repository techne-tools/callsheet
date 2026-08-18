//! SQLite store for callsheet.
//!
//! All queries are parameterized — never string-concatenate SQL. All card
//! state is scoped by `date` (ISO yyyy-mm-dd) — no cross-day bleed.
//!
//! Store functions take `&Connection` so they are testable against an
//! in-memory database without a real file.

use rusqlite::{params, Connection, Result};
use std::collections::HashSet;

use crate::colour_allocator;

/// The five seed activity types with their exact DESIGN.md fill HSL tokens.
const SEED_TYPES: &[(&str, &str)] = &[
    ("Research", "hsl(215, 15%, 93%)"),
    ("Making", "hsl(120, 15%, 92%)"),
    ("Teaching", "hsl(38, 30%, 93%)"),
    ("Body", "hsl(350, 20%, 94%)"),
    ("Admin", "hsl(30, 10%, 93%)"),
];

/// Create the schema tables if they do not exist.
pub fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS activity_types (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            colour TEXT NOT NULL,
            is_seed INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            markdown TEXT NOT NULL DEFAULT '',
            activity_type_id INTEGER NOT NULL REFERENCES activity_types(id)
        );
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            activity_type_id INTEGER NOT NULL REFERENCES activity_types(id),
            position INTEGER NOT NULL,
            markdown TEXT NOT NULL DEFAULT '',
            is_ghost INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_cards_date ON cards(date);
        CREATE INDEX IF NOT EXISTS idx_cards_activity ON cards(activity_type_id);",
    )
}

/// Seed the five activity types if the table is empty.
pub fn seed_activity_types(conn: &Connection) -> Result<()> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM activity_types",
        [],
        |row| row.get(0),
    )?;
    if count > 0 {
        return Ok(());
    }
    for (name, colour) in SEED_TYPES {
        conn.execute(
            "INSERT INTO activity_types (name, colour, is_seed) VALUES (?1, ?2, 1)",
            params![name, colour],
        )?;
    }
    Ok(())
}

/// Open (or create) the database at the given path and run schema + seed.
pub fn open(path: &std::path::Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", true)?;
    init_schema(&conn)?;
    seed_activity_types(&conn)?;
    Ok(conn)
}

/// Open an in-memory database (for tests) and run schema + seed.
#[cfg(test)]
pub fn open_in_memory() -> Result<Connection> {
    let conn = Connection::open_in_memory()?;
    conn.pragma_update(None, "foreign_keys", true)?;
    init_schema(&conn)?;
    seed_activity_types(&conn)?;
    Ok(conn)
}

/// Validate that `date` is an ISO yyyy-mm-dd string. Returns an error message
/// otherwise. Guards the "no cross-day bleed" invariant at the store boundary.
pub fn validate_date(date: &str) -> Result<(), String> {
    let is_iso = date.len() == 10
        && date.as_bytes()[4] == b'-'
        && date.as_bytes()[7] == b'-'
        && date[..4].chars().all(|c| c.is_ascii_digit())
        && date[5..7].chars().all(|c| c.is_ascii_digit())
        && date[8..10].chars().all(|c| c.is_ascii_digit());
    if is_iso {
        Ok(())
    } else {
        Err(format!("invalid date (expected yyyy-mm-dd): {}", date))
    }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/// A card row as stored/returned to the frontend.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: i64,
    pub date: String,
    pub activity_type_id: i64,
    pub position: i64,
    pub markdown: String,
    pub is_ghost: bool,
}

/// Input shape for saving a card (id 0 = insert).
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardInput {
    pub id: i64,
    pub date: String,
    pub activity_type_id: i64,
    pub position: i64,
    pub markdown: String,
    pub is_ghost: bool,
}

fn row_to_card(row: &rusqlite::Row) -> Result<Card> {
    Ok(Card {
        id: row.get(0)?,
        date: row.get(1)?,
        activity_type_id: row.get(2)?,
        position: row.get(3)?,
        markdown: row.get(4)?,
        is_ghost: row.get::<_, i64>(5)? != 0,
    })
}

/// List cards for a given day, ordered by position.
pub fn list_cards(conn: &Connection, date: &str) -> Result<Vec<Card>> {
    let mut stmt = conn.prepare(
        "SELECT id, date, activity_type_id, position, markdown, is_ghost
         FROM cards WHERE date = ?1 ORDER BY position ASC",
    )?;
    let rows = stmt.query_map(params![date], row_to_card)?;
    rows.collect()
}

/// Upsert a card by id. id 0 = insert. Returns the stored card.
pub fn save_card(conn: &Connection, input: &CardInput) -> Result<Card> {
    if input.id == 0 {
        conn.execute(
            "INSERT INTO cards (date, activity_type_id, position, markdown, is_ghost)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                input.date,
                input.activity_type_id,
                input.position,
                input.markdown,
                input.is_ghost as i64
            ],
        )?;
        let id = conn.last_insert_rowid();
        return get_card(conn, id);
    }
    let rows_affected = conn.execute(
        "UPDATE cards SET date = ?1, activity_type_id = ?2, position = ?3,
            markdown = ?4, is_ghost = ?5 WHERE id = ?6",
        params![
            input.date,
            input.activity_type_id,
            input.position,
            input.markdown,
            input.is_ghost as i64,
            input.id
        ],
    )?;
    if rows_affected == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    get_card(conn, input.id)
}

fn get_card(conn: &Connection, id: i64) -> Result<Card> {
    conn.query_row(
        "SELECT id, date, activity_type_id, position, markdown, is_ghost
         FROM cards WHERE id = ?1",
        params![id],
        row_to_card,
    )
}

/// Delete a card by id.
pub fn delete_card(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM cards WHERE id = ?1", params![id])?;
    Ok(())
}

/// Commit a ghost card (set is_ghost = 0). Returns the updated card.
pub fn commit_ghost_card(conn: &Connection, id: i64) -> Result<Card> {
    conn.execute(
        "UPDATE cards SET is_ghost = 0 WHERE id = ?1",
        params![id],
    )?;
    get_card(conn, id)
}

/// Reorder cards for a day atomically. `ids` is the new top-to-bottom order;
/// each card's position is set to its index. Scoped by `date` to prevent
/// cross-day bleed. Returns the updated cards for the day.
pub fn reorder_cards(conn: &mut Connection, date: &str, ids: &[i64]) -> Result<Vec<Card>> {
    let tx = conn.transaction()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE cards SET position = ?1 WHERE id = ?2 AND date = ?3",
            params![i as i64, id, date],
        )?;
    }
    tx.commit()?;
    list_cards(conn, date)
}

// ---------------------------------------------------------------------------
// Activity types
// ---------------------------------------------------------------------------

/// An activity type row.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityType {
    pub id: i64,
    pub name: String,
    pub colour: String,
    pub is_seed: bool,
}

fn row_to_activity_type(row: &rusqlite::Row) -> Result<ActivityType> {
    Ok(ActivityType {
        id: row.get(0)?,
        name: row.get(1)?,
        colour: row.get(2)?,
        is_seed: row.get::<_, i64>(3)? != 0,
    })
}

/// List all activity types.
pub fn list_activity_types(conn: &Connection) -> Result<Vec<ActivityType>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, colour, is_seed FROM activity_types ORDER BY id ASC",
    )?;
    let rows = stmt.query_map([], row_to_activity_type)?;
    rows.collect()
}

/// Create a new activity type, allocating a unique colour from the palette pool.
pub fn create_activity_type(conn: &Connection, name: &str) -> Result<ActivityType> {
    let used: HashSet<String> = {
        let mut stmt = conn.prepare("SELECT colour FROM activity_types")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<HashSet<_>>>()?
    };
    let colour = colour_allocator::allocate(&used);
    conn.execute(
        "INSERT INTO activity_types (name, colour, is_seed) VALUES (?1, ?2, 0)",
        params![name, colour],
    )?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, name, colour, is_seed FROM activity_types WHERE id = ?1",
        params![id],
        row_to_activity_type,
    )
}

/// Delete an activity type by id.
///
/// Seed types (the five core grammar colours) cannot be deleted — they are
/// the design contract. Types still referenced by cards or templates are
/// refused with a clear error (the FK constraint would otherwise fail with
/// a raw SQLite message).
pub fn delete_activity_type(conn: &Connection, id: i64) -> Result<(), String> {
    let is_seed: i64 = conn
        .query_row(
            "SELECT is_seed FROM activity_types WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if is_seed != 0 {
        return Err("seed activity types cannot be deleted".to_string());
    }
    let in_use: i64 = conn
        .query_row(
            "SELECT (SELECT COUNT(*) FROM cards WHERE activity_type_id = ?1)
                  + (SELECT COUNT(*) FROM templates WHERE activity_type_id = ?1)",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if in_use > 0 {
        return Err("activity type is in use by cards or templates".to_string());
    }
    conn.execute("DELETE FROM activity_types WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/// A template row.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: i64,
    pub name: String,
    pub markdown: String,
    pub activity_type_id: i64,
}

fn row_to_template(row: &rusqlite::Row) -> Result<Template> {
    Ok(Template {
        id: row.get(0)?,
        name: row.get(1)?,
        markdown: row.get(2)?,
        activity_type_id: row.get(3)?,
    })
}

/// List all templates.
pub fn list_templates(conn: &Connection) -> Result<Vec<Template>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, markdown, activity_type_id FROM templates ORDER BY id ASC",
    )?;
    let rows = stmt.query_map([], row_to_template)?;
    rows.collect()
}

/// Create a template.
pub fn create_template(
    conn: &Connection,
    name: &str,
    markdown: &str,
    activity_type_id: i64,
) -> Result<Template> {
    conn.execute(
        "INSERT INTO templates (name, markdown, activity_type_id) VALUES (?1, ?2, ?3)",
        params![name, markdown, activity_type_id],
    )?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, name, markdown, activity_type_id FROM templates WHERE id = ?1",
        params![id],
        row_to_template,
    )
}

/// Delete a template by id.
pub fn delete_template(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM templates WHERE id = ?1", params![id])?;
    Ok(())
}

/// Update a template's name, markdown, and activity type.
pub fn update_template(
    conn: &Connection,
    id: i64,
    name: &str,
    markdown: &str,
    activity_type_id: i64,
) -> Result<Template> {
    conn.execute(
        "UPDATE templates SET name = ?1, markdown = ?2, activity_type_id = ?3 WHERE id = ?4",
        params![name, markdown, activity_type_id, id],
    )?;
    conn.query_row(
        "SELECT id, name, markdown, activity_type_id FROM templates WHERE id = ?1",
        params![id],
        row_to_template,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_date_accepts_iso_and_rejects_malformed() {
        assert!(validate_date("2026-08-18").is_ok());
        assert!(validate_date("2026-8-18").is_err());
        assert!(validate_date("not-a-date").is_err());
        assert!(validate_date("2026-08-18T00:00:00").is_err());
    }

    #[test]
    fn card_round_trip() {
        let conn = open_in_memory().unwrap();

        // Seed types exist.
        let types = list_activity_types(&conn).unwrap();
        assert_eq!(types.len(), 5);
        let research = types.iter().find(|t| t.name == "Research").unwrap();
        assert_eq!(research.colour, "hsl(215, 15%, 93%)");

        // Insert a card.
        let saved = save_card(
            &conn,
            &CardInput {
                id: 0,
                date: "2026-08-18".to_string(),
                activity_type_id: research.id,
                position: 0,
                markdown: "# Hello".to_string(),
                is_ghost: false,
            },
        )
        .unwrap();
        assert!(saved.id > 0);
        assert_eq!(saved.markdown, "# Hello");
        assert!(!saved.is_ghost);

        // List it back.
        let cards = list_cards(&conn, "2026-08-18").unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].id, saved.id);
        assert_eq!(cards[0].date, "2026-08-18");
        assert_eq!(cards[0].activity_type_id, research.id);
        assert_eq!(cards[0].position, 0);
        assert_eq!(cards[0].markdown, "# Hello");

        // Day-scoping: another day has no cards.
        assert!(list_cards(&conn, "2026-08-19").unwrap().is_empty());

        // Update via upsert.
        let updated = save_card(
            &conn,
            &CardInput {
                id: saved.id,
                date: "2026-08-18".to_string(),
                activity_type_id: research.id,
                position: 1,
                markdown: "## Edited".to_string(),
                is_ghost: false,
            },
        )
        .unwrap();
        assert_eq!(updated.markdown, "## Edited");
        assert_eq!(updated.position, 1);

        // Ghost commit.
        let ghost = save_card(
            &conn,
            &CardInput {
                id: 0,
                date: "2026-08-18".to_string(),
                activity_type_id: research.id,
                position: 6,
                markdown: "proposal".to_string(),
                is_ghost: true,
            },
        )
        .unwrap();
        assert!(ghost.is_ghost);
        let committed = commit_ghost_card(&conn, ghost.id).unwrap();
        assert!(!committed.is_ghost);

        // Delete.
        delete_card(&conn, saved.id).unwrap();
        assert_eq!(list_cards(&conn, "2026-08-18").unwrap().len(), 1);
    }

    #[test]
    fn reorder_cards_is_atomic_and_day_scoped() {
        let mut conn = open_in_memory().unwrap();
        let types = list_activity_types(&conn).unwrap();
        let research = types.iter().find(|t| t.name == "Research").unwrap();

        // Insert 3 cards on the target day.
        let mut ids = Vec::new();
        for i in 0..3 {
            let card = save_card(
                &conn,
                &CardInput {
                    id: 0,
                    date: "2026-08-18".to_string(),
                    activity_type_id: research.id,
                    position: i,
                    markdown: format!("card {}", i),
                    is_ghost: false,
                },
            )
            .unwrap();
            ids.push(card.id);
        }

        // A card on another day must be untouched by reordering.
        let other = save_card(
            &conn,
            &CardInput {
                id: 0,
                date: "2026-08-19".to_string(),
                activity_type_id: research.id,
                position: 0,
                markdown: "other day".to_string(),
                is_ghost: false,
            },
        )
        .unwrap();

        // Reverse the order.
        ids.reverse();
        let reordered = reorder_cards(&mut conn, "2026-08-18", &ids).unwrap();
        assert_eq!(reordered.len(), 3);
        for (i, card) in reordered.iter().enumerate() {
            assert_eq!(card.position, i as i64);
            assert_eq!(card.id, ids[i]);
        }

        // The other day's card is untouched.
        let other_cards = list_cards(&conn, "2026-08-19").unwrap();
        assert_eq!(other_cards.len(), 1);
        assert_eq!(other_cards[0].id, other.id);
        assert_eq!(other_cards[0].position, 0);
    }

    #[test]
    fn create_activity_type_allocates_unique_colour() {
        let conn = open_in_memory().unwrap();
        let a = create_activity_type(&conn, "Custom A").unwrap();
        let b = create_activity_type(&conn, "Custom B").unwrap();
        assert_ne!(a.colour, b.colour);
        assert!(!a.is_seed);
        assert!(!b.is_seed);
    }

    #[test]
    fn delete_activity_type_guards_seed_and_in_use() {
        let conn = open_in_memory().unwrap();
        let types = list_activity_types(&conn).unwrap();
        let seed = types.iter().find(|t| t.is_seed).unwrap();

        // Seed types cannot be deleted.
        assert!(delete_activity_type(&conn, seed.id).is_err());

        // A custom type in use by a card cannot be deleted.
        let custom = create_activity_type(&conn, "Custom").unwrap();
        save_card(
            &conn,
            &CardInput {
                id: 0,
                date: "2026-08-18".to_string(),
                activity_type_id: custom.id,
                position: 0,
                markdown: "x".to_string(),
                is_ghost: false,
            },
        )
        .unwrap();
        assert!(delete_activity_type(&conn, custom.id).is_err());

        // An unused custom type can be deleted.
        let free = create_activity_type(&conn, "Free").unwrap();
        delete_activity_type(&conn, free.id).unwrap();
        assert!(
            list_activity_types(&conn)
                .unwrap()
                .iter()
                .all(|t| t.id != free.id)
        );
    }

    #[test]
    fn template_round_trip() {
        let conn = open_in_memory().unwrap();
        let types = list_activity_types(&conn).unwrap();
        let t = create_template(&conn, "Standup", "- [ ] standup", types[0].id).unwrap();
        assert!(t.id > 0);
        let templates = list_templates(&conn).unwrap();
        assert_eq!(templates.len(), 1);
        assert_eq!(templates[0].name, "Standup");
        delete_template(&conn, t.id).unwrap();
        assert!(list_templates(&conn).unwrap().is_empty());
    }

    #[test]
    fn template_update_changes_fields() {
        let conn = open_in_memory().unwrap();
        let types = list_activity_types(&conn).unwrap();
        let t = create_template(&conn, "Old", "old body", types[0].id).unwrap();
        let updated = update_template(&conn, t.id, "New", "new body", types[1].id).unwrap();
        assert_eq!(updated.name, "New");
        assert_eq!(updated.markdown, "new body");
        assert_eq!(updated.activity_type_id, types[1].id);
        // The row is actually persisted, not just returned.
        let listed = list_templates(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "New");
    }
}
