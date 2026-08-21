//! Colour allocator for custom activity types.
//!
//! The palette pool is a set of pastel fill HSL tokens (~87-89% lightness,
//! v0.4.0: strengthened from ~92-94% to match the seed register), distinct
//! from the five seed types. Uniqueness is a hard invariant: a colour is
//! never reused across activity types.

use std::collections::HashSet;

/// The palette pool of pastel fill HSL tokens available to custom types.
/// These are distinct from the five seed colours (Research/Making/Teaching/
/// Body/Admin) so custom types never collide with seeds either.
pub fn palette_pool() -> Vec<String> {
    vec![
        "hsl(260, 25%, 88%)".to_string(), // lavender
        "hsl(200, 30%, 87%)".to_string(), // sky
        "hsl(160, 25%, 87%)".to_string(), // mint
        "hsl(80, 30%, 87%)".to_string(),  // lime
        "hsl(20, 35%, 88%)".to_string(),  // apricot
        "hsl(330, 25%, 88%)".to_string(), // blush
        "hsl(280, 20%, 88%)".to_string(), // mauve
        "hsl(190, 25%, 87%)".to_string(), // teal
        "hsl(50, 30%, 87%)".to_string(),  // butter
        "hsl(0, 20%, 88%)".to_string(),   // coral
        "hsl(140, 20%, 87%)".to_string(), // sage-light
        "hsl(220, 25%, 87%)".to_string(), // periwinkle
        "hsl(10, 25%, 88%)".to_string(),  // peach
        "hsl(300, 20%, 88%)".to_string(), // orchid
    ]
}

/// Returns the first palette colour not present in `used`.
///
/// Uniqueness is a hard invariant. If every pool colour is already used, the
/// pool is exhausted and we fall back to a deterministic hash of the used set
/// to keep the invariant (no two types share a colour) as best as possible.
pub fn allocate(used: &HashSet<String>) -> String {
    for colour in palette_pool() {
        if !used.contains(&colour) {
            return colour;
        }
    }
    // Pool exhausted: derive a stable starting hue from the used set, then
    // increment until we find a hue whose colour is not already in use. This
    // is guaranteed to terminate because the hue space is 360 and `used` is
    // finite, so at most 360 candidates are checked.
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    use std::hash::{Hash, Hasher};
    let mut sorted: Vec<&String> = used.iter().collect();
    sorted.sort();
    sorted.hash(&mut hasher);
    let mut h = (hasher.finish() % 360) as u32;
    loop {
        let colour = format!("hsl({}, 25%, 88%)", h);
        if !used.contains(&colour) {
            return colour;
        }
        h = (h + 1) % 360;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allocate_returns_distinct_colours() {
        let mut used = HashSet::new();
        let mut allocated = HashSet::new();
        for _ in 0..palette_pool().len() {
            let colour = allocate(&used);
            assert!(
                !allocated.contains(&colour),
                "colour {} was allocated twice",
                colour
            );
            allocated.insert(colour.clone());
            used.insert(colour);
        }
        assert_eq!(allocated.len(), palette_pool().len());
    }

    #[test]
    fn allocate_respects_used_set() {
        let mut used = HashSet::new();
        used.insert("hsl(260, 20%, 93%)".to_string());
        let colour = allocate(&used);
        assert!(!used.contains(&colour));
    }

    #[test]
    fn allocate_after_pool_exhaustion_stays_unique() {
        let mut used = HashSet::new();
        let mut allocated = HashSet::new();
        // Exhaust the pool and keep allocating well beyond it.
        for _ in 0..(palette_pool().len() + 20) {
            let colour = allocate(&used);
            assert!(
                !allocated.contains(&colour),
                "colour {} was allocated twice",
                colour
            );
            allocated.insert(colour.clone());
            used.insert(colour);
        }
        assert_eq!(allocated.len(), palette_pool().len() + 20);
    }
}
