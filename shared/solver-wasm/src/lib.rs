//! WebAssembly Minesweeper Solver for 3D Video Minesweeper.
//!
//! Exports high-level functions callable from JavaScript via wasm-bindgen.
//! All grid data is passed as flat `Int8Array` / `Uint8Array` in column-major
//! layout: `cells[x * height + y]` maps to JS `grid[x][y]`.

pub mod board;
pub mod gaussian;
pub mod rng;
pub mod solver;
pub mod types;

// ─── WASM Exports (only compiled for wasm32 target) ─────────────────────────

#[cfg(target_arch = "wasm32")]
mod wasm_exports {
    use wasm_bindgen::prelude::*;
    use crate::types::{Flags, Grid, Mines, NeighborCache, VisibleGrid};
    use crate::{board, solver};

    /// Check if a board is solvable without guessing.
    #[wasm_bindgen(js_name = "isSolvable")]
    pub fn wasm_is_solvable(
        width: usize,
        height: usize,
        grid_flat: &[i8],
        mines_flat: &[u8],
        start_x: usize,
        start_y: usize,
    ) -> bool {
        let grid = Grid { width, height, cells: grid_flat.to_vec() };
        let mines = Mines { width, height, cells: mines_flat.to_vec() };
        let nc = NeighborCache::new(width, height);
        solver::is_solvable(&grid, &mines, &nc, start_x, start_y)
    }

    /// Generate a solvable board (No-Guess mode).
    /// Returns JS object: `{ success: bool, attempts: u32, grid: Int8Array, mines: Uint8Array }`
    #[wasm_bindgen(js_name = "generateSolvableBoard")]
    pub fn wasm_generate_solvable_board(
        width: usize,
        height: usize,
        bomb_count: usize,
        safe_x: usize,
        safe_y: usize,
        safe_radius: usize,
        max_attempts: u32,
    ) -> JsValue {
        let nc = NeighborCache::new(width, height);

        let result = board::generate_solvable_board(
            width, height, bomb_count, safe_x, safe_y, safe_radius,
            max_attempts, &nc,
            |grid, mines, nc, sx, sy| solver::is_solvable(grid, mines, nc, sx, sy),
        );

        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"success".into(), &result.success.into()).unwrap();
        js_sys::Reflect::set(&obj, &"attempts".into(), &result.attempts.into()).unwrap();

        let grid_arr = js_sys::Int8Array::new_with_length(result.grid.cells.len() as u32);
        grid_arr.copy_from(&result.grid.cells);
        js_sys::Reflect::set(&obj, &"grid".into(), &grid_arr.into()).unwrap();

        let mines_arr = js_sys::Uint8Array::new_with_length(result.mines.cells.len() as u32);
        mines_arr.copy_from(&result.mines.cells);
        js_sys::Reflect::set(&obj, &"mines".into(), &mines_arr.into()).unwrap();

        obj.into()
    }

    /// Calculate neighbor mine counts for all cells.
    #[wasm_bindgen(js_name = "calculateNumbers")]
    pub fn wasm_calculate_numbers(
        width: usize,
        height: usize,
        mines_flat: &[u8],
    ) -> js_sys::Int8Array {
        let mines = Mines { width, height, cells: mines_flat.to_vec() };
        let nc = NeighborCache::new(width, height);
        let grid = board::calculate_numbers(&mines, &nc);

        let arr = js_sys::Int8Array::new_with_length(grid.cells.len() as u32);
        arr.copy_from(&grid.cells);
        arr
    }

    /// Get a hint (best safe cell to reveal).
    /// Returns JS object `{ x, y, score }` or `null`.
    #[wasm_bindgen(js_name = "getHint")]
    pub fn wasm_get_hint(
        width: usize,
        height: usize,
        grid_flat: &[i8],
        visible_flat: &[i8],
        flags_flat: &[u8],
        mines_flat: &[u8],
    ) -> JsValue {
        let grid = Grid { width, height, cells: grid_flat.to_vec() };
        let visible = VisibleGrid { width, height, cells: visible_flat.to_vec() };
        let flags = Flags { width, height, cells: flags_flat.to_vec() };
        let mines = Mines { width, height, cells: mines_flat.to_vec() };
        let nc = NeighborCache::new(width, height);

        match solver::get_hint(&grid, &visible, &flags, &mines, &nc) {
            Some(hint) => {
                let obj = js_sys::Object::new();
                js_sys::Reflect::set(&obj, &"x".into(), &(hint.x as u32).into()).unwrap();
                js_sys::Reflect::set(&obj, &"y".into(), &(hint.y as u32).into()).unwrap();
                js_sys::Reflect::set(&obj, &"score".into(), &hint.score.into()).unwrap();
                obj.into()
            }
            None => JsValue::NULL,
        }
    }

    /// Ping function to verify WASM is loaded.
    #[wasm_bindgen(js_name = "ping")]
    pub fn wasm_ping() -> String {
        "WASM solver ready".to_string()
    }
}
