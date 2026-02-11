//! Board generation: mine placement and number calculation.
//!
//! Ports the logic from `Game.placeMines()` and `Game.calculateNumbers()`.
//! The key function is `generate_solvable_board()` which runs the entire
//! retry loop inside WASM for maximum performance.

use crate::rng::WasmRng;
use crate::types::{Grid, Mines, NeighborCache};

/// Place mines randomly with a safe zone exclusion.
///
/// Mirrors the JS `placeMines()` inner loop: randomly place `bomb_count` mines,
/// skipping cells within `safe_radius` of `(safe_x, safe_y)`.
pub fn place_mines_random(
    width: usize,
    height: usize,
    bomb_count: usize,
    safe_x: usize,
    safe_y: usize,
    safe_radius: usize,
    rng: &mut WasmRng,
) -> Mines {
    let mut mines = Mines::new(width, height);
    let mut placed = 0;
    let mut attempts = 0;
    let max_placement_attempts = 100_000;

    while placed < bomb_count && attempts < max_placement_attempts {
        attempts += 1;
        let x = rng.gen_range(width);
        let y = rng.gen_range(height);

        // Check exclusion zone
        let dx = if x >= safe_x { x - safe_x } else { safe_x - x };
        let dy = if y >= safe_y { y - safe_y } else { safe_y - y };
        if dx <= safe_radius && dy <= safe_radius {
            continue;
        }

        if !mines.get(x, y) {
            mines.set(x, y, true);
            placed += 1;
        }
    }

    mines
}

/// Calculate the neighbor mine counts for all non-mine cells.
///
/// Returns a Grid where each non-mine cell contains the count of adjacent mines (0-8).
/// Mine cells retain value 0 (the grid value for mine cells is not used by the solver).
pub fn calculate_numbers(mines: &Mines, neighbor_cache: &NeighborCache) -> Grid {
    let width = mines.width;
    let height = mines.height;
    let mut grid = Grid::new(width, height);

    for x in 0..width {
        for y in 0..height {
            if mines.get(x, y) {
                continue;
            }

            let mut count: i8 = 0;
            for &(nx, ny) in neighbor_cache.get(x, y) {
                if mines.get(nx, ny) {
                    count += 1;
                }
            }
            grid.set(x, y, count);
        }
    }

    grid
}

/// Result of a board generation attempt.
pub struct BoardResult {
    /// Mine positions (flat, column-major).
    pub mines: Mines,
    /// Number grid (flat, column-major). Non-mine cells have values 0-8.
    pub grid: Grid,
    /// How many random layouts were tried before finding a solvable one.
    pub attempts: u32,
    /// True if a solvable board was found within max_attempts.
    pub success: bool,
}

/// Generate a solvable board by repeatedly placing mines and checking solvability.
///
/// This is the main entry point that replaces the entire `do { ... } while (!isSolvable)`
/// loop from JS `Game.placeMines()`. Running the whole loop inside WASM avoids
/// per-iteration JS↔WASM boundary crossings.
///
/// The `is_solvable_fn` parameter allows injecting the solver (which lives in solver.rs).
/// This keeps board.rs decoupled from the solver implementation.
pub fn generate_solvable_board<F>(
    width: usize,
    height: usize,
    bomb_count: usize,
    safe_x: usize,
    safe_y: usize,
    safe_radius: usize,
    max_attempts: u32,
    neighbor_cache: &NeighborCache,
    is_solvable_fn: F,
) -> BoardResult
where
    F: Fn(&Grid, &Mines, &NeighborCache, usize, usize) -> bool,
{
    let mut rng = WasmRng::new();
    let mut attempts: u32 = 0;

    loop {
        attempts += 1;

        let mines = place_mines_random(width, height, bomb_count, safe_x, safe_y, safe_radius, &mut rng);
        let grid = calculate_numbers(&mines, neighbor_cache);

        if is_solvable_fn(&grid, &mines, neighbor_cache, safe_x, safe_y) {
            return BoardResult {
                mines,
                grid,
                attempts,
                success: true,
            };
        }

        if attempts >= max_attempts {
            // Return the last attempted board (not solvable, but best effort)
            return BoardResult {
                mines,
                grid,
                attempts,
                success: false,
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_place_mines_count() {
        let mut rng = WasmRng::from_seed(42);
        let mines = place_mines_random(30, 16, 99, 15, 8, 1, &mut rng);
        assert_eq!(mines.count(), 99);
    }

    #[test]
    fn test_place_mines_safe_zone() {
        let mut rng = WasmRng::from_seed(42);
        let mines = place_mines_random(10, 10, 20, 5, 5, 2, &mut rng);

        // No mines within radius 2 of (5,5)
        for x in 3..=7 {
            for y in 3..=7 {
                assert!(!mines.get(x, y), "Mine found in safe zone at ({}, {})", x, y);
            }
        }
        assert_eq!(mines.count(), 20);
    }

    #[test]
    fn test_calculate_numbers_simple() {
        let nc = NeighborCache::new(3, 3);
        let mut mines = Mines::new(3, 3);
        // Place a single mine at (1, 1) center
        mines.set(1, 1, true);

        let grid = calculate_numbers(&mines, &nc);

        // All 8 neighbors should be 1
        assert_eq!(grid.get(0, 0), 1);
        assert_eq!(grid.get(0, 1), 1);
        assert_eq!(grid.get(0, 2), 1);
        assert_eq!(grid.get(1, 0), 1);
        assert_eq!(grid.get(1, 2), 1);
        assert_eq!(grid.get(2, 0), 1);
        assert_eq!(grid.get(2, 1), 1);
        assert_eq!(grid.get(2, 2), 1);
    }

    #[test]
    fn test_calculate_numbers_corner_mine() {
        let nc = NeighborCache::new(3, 3);
        let mut mines = Mines::new(3, 3);
        // Mine at corner (0, 0)
        mines.set(0, 0, true);

        let grid = calculate_numbers(&mines, &nc);

        // (1,0), (0,1), (1,1) should be 1, others 0
        assert_eq!(grid.get(1, 0), 1);
        assert_eq!(grid.get(0, 1), 1);
        assert_eq!(grid.get(1, 1), 1);
        assert_eq!(grid.get(2, 0), 0);
        assert_eq!(grid.get(2, 2), 0);
    }

    #[test]
    fn test_generate_solvable_board_always_solvable() {
        let nc = NeighborCache::new(5, 5);
        // Trivial solver that always returns true
        let result = generate_solvable_board(5, 5, 3, 2, 2, 1, 100, &nc, |_, _, _, _, _| true);
        assert!(result.success);
        assert_eq!(result.attempts, 1); // Should succeed on first try
        assert_eq!(result.mines.count(), 3);
    }

    #[test]
    fn test_generate_solvable_board_never_solvable() {
        let nc = NeighborCache::new(5, 5);
        // Solver that always returns false
        let result = generate_solvable_board(5, 5, 3, 2, 2, 1, 10, &nc, |_, _, _, _, _| false);
        assert!(!result.success);
        assert_eq!(result.attempts, 10);
    }
}
