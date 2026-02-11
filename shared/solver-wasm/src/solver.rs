//! Minesweeper Solver — all solving strategies.
//!
//! Ports `MinesweeperSolver.js` to Rust. Contains:
//! - Strategy 1: Basic counting rules
//! - Strategy 2: Subset logic (constraint propagation)
//! - Strategy 3: Gaussian Elimination (delegated to gaussian.rs)
//! - Strategy 4: Proof by contradiction
//! - Strategy 5: Tank solver (configuration enumeration)
//! - Strategy 6: Global mine counting
//! - Top-level `is_solvable()` and `get_hint()`

use crate::gaussian;
use crate::types::{cell_key, decode_key, Flags, Grid, Mines, NeighborCache, VisibleGrid};
use std::collections::{HashMap, HashSet};

/// Maximum region size for tank solver enumeration.
const MAX_REGION_SIZE: usize = 20;

/// Maximum configurations to test (2^MAX_REGION_SIZE).
const MAX_CONFIGURATIONS: u64 = 1 << MAX_REGION_SIZE;

// ─── Helper: simulate_reveal ────────────────────────────────────────────────

/// Simulate revealing a cell with flood fill for zeros.
/// Updates `visible` in-place, matching JS `simulateReveal()`.
pub fn simulate_reveal(
    grid: &Grid,
    visible: &mut VisibleGrid,
    flags: &Flags,
    x: usize,
    y: usize,
) {
    let width = grid.width;
    let height = grid.height;
    let mut stack: Vec<(usize, usize)> = vec![(x, y)];

    while let Some((cx, cy)) = stack.pop() {
        if cx >= width || cy >= height { continue; }
        if visible.get(cx, cy) != -1 || flags.get(cx, cy) { continue; }

        let val = grid.get(cx, cy);
        visible.set(cx, cy, val);

        if val == 0 {
            for dx in -1i32..=1 {
                for dy in -1i32..=1 {
                    if dx == 0 && dy == 0 { continue; }
                    let nx = cx as i32 + dx;
                    let ny = cy as i32 + dy;
                    if nx >= 0 && nx < width as i32 && ny >= 0 && ny < height as i32 {
                        stack.push((nx as usize, ny as usize));
                    }
                }
            }
        }
    }
}

// ─── Helper: get_frontier ───────────────────────────────────────────────────

/// Get all frontier cells: hidden, unflagged cells adjacent to a revealed number.
fn get_frontier(
    visible: &VisibleGrid,
    flags: &Flags,
    nc: &NeighborCache,
) -> Vec<(usize, usize)> {
    let width = visible.width;
    let height = visible.height;
    let mut frontier = Vec::new();

    for x in 0..width {
        for y in 0..height {
            if visible.get(x, y) == -1 && !flags.get(x, y) {
                for &(nx, ny) in nc.get(x, y) {
                    if visible.get(nx, ny) > 0 {
                        frontier.push((x, y));
                        break;
                    }
                }
            }
        }
    }
    frontier
}

// ─── Strategy 1: Basic Rules ────────────────────────────────────────────────

struct BasicResult {
    progress: bool,
    flag_count: u32,
    dirty_cells: HashSet<u32>,
}

fn apply_basic_rules(
    grid: &Grid,
    visible: &mut VisibleGrid,
    flags: &mut Flags,
    nc: &NeighborCache,
    dirty_cells: &HashSet<u32>,
    flag_count: u32,
) -> BasicResult {
    let width = grid.width;
    let height = grid.height;
    let mut progress = false;
    let mut new_dirty = HashSet::new();
    let mut processed = HashSet::new();
    let mut fc = flag_count;

    for &key in dirty_cells {
        let (x, y) = decode_key(key);
        if x >= width || y >= height { continue; }

        let val = visible.get(x, y);
        if val <= 0 { continue; }
        if processed.contains(&key) { continue; }
        processed.insert(key);

        let neighbors = nc.get(x, y);
        let mut hidden_count = 0i32;
        let mut flagged_count = 0i32;
        let mut hidden_cells: Vec<(usize, usize)> = Vec::new();

        for &(nx, ny) in neighbors {
            if flags.get(nx, ny) {
                flagged_count += 1;
            } else if visible.get(nx, ny) == -1 {
                hidden_count += 1;
                hidden_cells.push((nx, ny));
            }
        }

        if hidden_count == 0 { continue; }

        if val as i32 == hidden_count + flagged_count {
            // All hidden neighbors are mines
            for &(nx, ny) in &hidden_cells {
                if !flags.get(nx, ny) {
                    flags.set(nx, ny, true);
                    fc += 1;
                    for &(nnx, nny) in nc.get(nx, ny) {
                        new_dirty.insert(cell_key(nnx, nny));
                    }
                }
            }
            progress = true;
        } else if val as i32 == flagged_count {
            // All hidden neighbors are safe
            for &(nx, ny) in &hidden_cells {
                simulate_reveal(grid, visible, flags, nx, ny);
                for &(nnx, nny) in nc.get(nx, ny) {
                    new_dirty.insert(cell_key(nnx, nny));
                }
            }
            progress = true;
        }
    }

    BasicResult {
        progress,
        flag_count: fc,
        dirty_cells: if progress { new_dirty } else { dirty_cells.clone() },
    }
}

// ─── Strategy 2: Subset Logic ───────────────────────────────────────────────

struct SubsetResult {
    progress: bool,
    flag_count: u32,
    dirty_cells: HashSet<u32>,
}

fn apply_subset_logic(
    grid: &Grid,
    visible: &mut VisibleGrid,
    flags: &mut Flags,
    nc: &NeighborCache,
    dirty_cells: &HashSet<u32>,
    flag_count: u32,
) -> SubsetResult {
    let width = grid.width;
    let height = grid.height;
    let mut progress = false;
    let mut new_dirty = HashSet::new();
    let mut fc = flag_count;

    // Build constraint cells near dirty cells
    let mut constraint_keys = HashSet::new();
    for &key in dirty_cells {
        let (x, y) = decode_key(key);
        if x >= width || y >= height { continue; }
        if visible.get(x, y) > 0 {
            constraint_keys.insert(key);
        }
        for &(nx, ny) in nc.get(x, y) {
            if visible.get(nx, ny) > 0 {
                constraint_keys.insert(cell_key(nx, ny));
            }
        }
    }

    // Pre-compute hidden sets for constraint cells
    struct CellData {
        x: usize,
        y: usize,
        hidden_set: HashSet<u32>,
        hidden_list: Vec<(usize, usize)>,
        remaining: i32,
    }

    let mut cell_data: HashMap<u32, CellData> = HashMap::new();

    for &key in &constraint_keys {
        let (x, y) = decode_key(key);
        let val = visible.get(x, y);
        if val <= 0 { continue; }

        let neighbors = nc.get(x, y);
        let mut hidden_set = HashSet::new();
        let mut hidden_list = Vec::new();
        let mut flagged_count = 0i32;

        for &(nx, ny) in neighbors {
            if flags.get(nx, ny) {
                flagged_count += 1;
            } else if visible.get(nx, ny) == -1 {
                hidden_set.insert(cell_key(nx, ny));
                hidden_list.push((nx, ny));
            }
        }

        if hidden_list.is_empty() { continue; }
        let remaining = val as i32 - flagged_count;
        if remaining < 0 { continue; }

        cell_data.insert(key, CellData { x, y, hidden_set, hidden_list, remaining });
    }

    // Compare pairs in 5x5 region
    let keys: Vec<u32> = cell_data.keys().copied().collect();
    for &key_a in &keys {
        let data_a = match cell_data.get(&key_a) { Some(d) => d, None => continue };
        if data_a.hidden_list.is_empty() { continue; }

        for dx in -2i32..=2 {
            for dy in -2i32..=2 {
                if dx == 0 && dy == 0 { continue; }
                let nx = data_a.x as i32 + dx;
                let ny = data_a.y as i32 + dy;
                if nx < 0 || nx >= width as i32 || ny < 0 || ny >= height as i32 { continue; }

                let key_b = cell_key(nx as usize, ny as usize);
                let data_b = match cell_data.get(&key_b) { Some(d) => d, None => continue };
                if data_b.hidden_list.is_empty() { continue; }

                // Check if A ⊂ B
                if data_a.hidden_set.len() < data_b.hidden_set.len()
                    && data_a.hidden_set.is_subset(&data_b.hidden_set)
                {
                    // Compute B \ A
                    let diff: Vec<(usize, usize)> = data_b.hidden_list.iter()
                        .filter(|&&(bx, by)| !data_a.hidden_set.contains(&cell_key(bx, by)))
                        .copied()
                        .collect();

                    let diff_mines = data_b.remaining - data_a.remaining;

                    if diff_mines == 0 && !diff.is_empty() {
                        // All diff cells are safe
                        for &(sx, sy) in &diff {
                            simulate_reveal(grid, visible, flags, sx, sy);
                            for &(nnx, nny) in nc.get(sx, sy) {
                                new_dirty.insert(cell_key(nnx, nny));
                            }
                        }
                        progress = true;
                    } else if diff_mines == diff.len() as i32 && !diff.is_empty() {
                        // All diff cells are mines
                        for &(mx, my) in &diff {
                            if !flags.get(mx, my) {
                                flags.set(mx, my, true);
                                fc += 1;
                                for &(nnx, nny) in nc.get(mx, my) {
                                    new_dirty.insert(cell_key(nnx, nny));
                                }
                            }
                        }
                        progress = true;
                    }

                    if progress {
                        return SubsetResult { progress, flag_count: fc, dirty_cells: new_dirty };
                    }
                }
            }
        }
    }

    SubsetResult { progress, flag_count: fc, dirty_cells: dirty_cells.clone() }
}

// ─── Strategy 3: Gaussian Elimination (wrapper) ─────────────────────────────

struct GaussianWrapperResult {
    progress: bool,
    flag_count: u32,
    changed_cells: Vec<(usize, usize)>,
}

fn solve_by_gaussian_elimination(
    grid: &Grid,
    visible: &mut VisibleGrid,
    flags: &mut Flags,
    nc: &NeighborCache,
    flag_count: u32,
) -> GaussianWrapperResult {
    let frontier = get_frontier(visible, flags, nc);
    if frontier.is_empty() {
        return GaussianWrapperResult { progress: false, flag_count, changed_cells: vec![] };
    }

    let result = gaussian::solve(visible, flags, &frontier, nc);
    if !result.progress {
        return GaussianWrapperResult { progress: false, flag_count, changed_cells: vec![] };
    }

    let mut fc = flag_count;
    let mut changed = Vec::new();

    for &(mx, my) in &result.mines {
        if !flags.get(mx, my) {
            flags.set(mx, my, true);
            fc += 1;
            changed.push((mx, my));
        }
    }

    for &(sx, sy) in &result.safe {
        if visible.get(sx, sy) == -1 {
            simulate_reveal(grid, visible, flags, sx, sy);
            changed.push((sx, sy));
        }
    }

    GaussianWrapperResult { progress: true, flag_count: fc, changed_cells: changed }
}

// ─── Strategy 4: Proof by Contradiction ─────────────────────────────────────

struct ContradictionResult {
    progress: bool,
    flag_count: u32,
    changed_cell: Option<(usize, usize)>,
}

fn solve_by_contradiction(
    grid: &Grid,
    visible: &mut VisibleGrid,
    flags: &mut Flags,
    nc: &NeighborCache,
    flag_count: u32,
) -> ContradictionResult {
    let frontier = get_frontier(visible, flags, nc);
    let max_check = frontier.len().min(50);

    for i in 0..max_check {
        let (cx, cy) = frontier[i];

        // Test: assume cell IS a mine → contradiction means cell is SAFE
        if check_contradiction(visible, flags, nc, cx, cy, true) {
            simulate_reveal(grid, visible, flags, cx, cy);
            return ContradictionResult {
                progress: true,
                flag_count,
                changed_cell: Some((cx, cy)),
            };
        }

        // Test: assume cell is NOT a mine → contradiction means cell IS a mine
        if check_contradiction(visible, flags, nc, cx, cy, false) {
            flags.set(cx, cy, true);
            return ContradictionResult {
                progress: true,
                flag_count: flag_count + 1,
                changed_cell: Some((cx, cy)),
            };
        }
    }

    ContradictionResult { progress: false, flag_count, changed_cell: None }
}

/// Check if assuming a cell is/isn't a mine leads to a contradiction.
/// Uses sparse simulation with HashMap overlays (no full grid copies).
fn check_contradiction(
    visible: &VisibleGrid,
    flags: &Flags,
    nc: &NeighborCache,
    ax: usize,
    ay: usize,
    assume_mine: bool,
) -> bool {
    let mut sim_flags: HashMap<u32, bool> = HashMap::new();
    let mut sim_revealed: HashSet<u32> = HashSet::new();

    let get_flag = |x: usize, y: usize, sf: &HashMap<u32, bool>| -> bool {
        let k = cell_key(x, y);
        sf.get(&k).copied().unwrap_or_else(|| flags.get(x, y))
    };

    if assume_mine {
        sim_flags.insert(cell_key(ax, ay), true);
    } else {
        sim_revealed.insert(cell_key(ax, ay));
    }

    let mut to_check: HashSet<u32> = HashSet::new();
    for &(nx, ny) in nc.get(ax, ay) {
        to_check.insert(cell_key(nx, ny));
    }

    let mut changed = true;
    let mut iterations = 0;
    let max_iterations = 20;

    while changed && iterations < max_iterations {
        changed = false;
        iterations += 1;

        let current_check: Vec<u32> = to_check.drain().collect();

        for key in current_check {
            let (x, y) = decode_key(key);
            let val = visible.get(x, y);
            if val <= 0 { continue; }

            let neighbors = nc.get(x, y);
            let mut hidden_count = 0i32;
            let mut flagged_count = 0i32;
            let mut hidden_cells: Vec<(usize, usize)> = Vec::new();

            for &(nx, ny) in neighbors {
                if get_flag(nx, ny, &sim_flags) {
                    flagged_count += 1;
                } else if visible.get(nx, ny) == -1 && !sim_revealed.contains(&cell_key(nx, ny)) {
                    hidden_count += 1;
                    hidden_cells.push((nx, ny));
                }
            }

            // Contradiction checks
            if flagged_count > val as i32 { return true; }
            if flagged_count + hidden_count < val as i32 { return true; }

            if hidden_count > 0 {
                if flagged_count == val as i32 {
                    // All hidden are safe
                    for &(nx, ny) in &hidden_cells {
                        let k = cell_key(nx, ny);
                        if !sim_revealed.contains(&k) {
                            sim_revealed.insert(k);
                            changed = true;
                            for &(nnx, nny) in nc.get(nx, ny) {
                                to_check.insert(cell_key(nnx, nny));
                            }
                        }
                    }
                } else if flagged_count + hidden_count == val as i32 {
                    // All hidden are mines
                    for &(nx, ny) in &hidden_cells {
                        let k = cell_key(nx, ny);
                        if !get_flag(nx, ny, &sim_flags) {
                            sim_flags.insert(k, true);
                            changed = true;
                            for &(nnx, nny) in nc.get(nx, ny) {
                                to_check.insert(cell_key(nnx, nny));
                            }
                        }
                    }
                }
            }
        }
    }

    false
}

// ─── Strategy 5: Tank Solver ────────────────────────────────────────────────

struct TankResult {
    progress: bool,
    flag_count: u32,
    changed_cells: Vec<(usize, usize)>,
}

fn tank_solver(
    grid: &Grid,
    visible: &mut VisibleGrid,
    flags: &mut Flags,
    nc: &NeighborCache,
    bomb_count: usize,
    flag_count: u32,
) -> TankResult {
    let frontier = get_frontier(visible, flags, nc);
    if frontier.is_empty() {
        return TankResult { progress: false, flag_count, changed_cells: vec![] };
    }

    let regions = group_frontier_regions(&frontier, visible, nc);
    // Sort smallest regions first
    let mut sorted_regions = regions;
    sorted_regions.sort_by_key(|r| r.len());

    let mut fc = flag_count;
    let mut changed = Vec::new();

    for region in &sorted_regions {
        if region.len() > MAX_REGION_SIZE { continue; }

        let constraints = get_region_constraints(region, visible, flags, nc);
        if constraints.is_empty() { continue; }

        let remaining_mines = bomb_count as i32 - fc as i32;
        if remaining_mines < 0 { continue; }

        let valid_configs = enumerate_configurations(region, &constraints, remaining_mines as usize);
        if valid_configs.is_empty() { continue; }

        let (definite_mines, definite_safes) = analyze_configurations(region, &valid_configs);

        let mut progress = false;

        for &(mx, my) in &definite_mines {
            if !flags.get(mx, my) {
                flags.set(mx, my, true);
                fc += 1;
                changed.push((mx, my));
                progress = true;
            }
        }

        for &(sx, sy) in &definite_safes {
            if visible.get(sx, sy) == -1 {
                simulate_reveal(grid, visible, flags, sx, sy);
                changed.push((sx, sy));
                progress = true;
            }
        }

        if progress {
            return TankResult { progress: true, flag_count: fc, changed_cells: changed };
        }
    }

    TankResult { progress: false, flag_count: fc, changed_cells: changed }
}

/// Group frontier cells into connected regions.
fn group_frontier_regions(
    frontier: &[(usize, usize)],
    visible: &VisibleGrid,
    nc: &NeighborCache,
) -> Vec<Vec<(usize, usize)>> {
    if frontier.is_empty() { return vec![]; }

    let mut regions = Vec::new();
    let mut visited: HashSet<u32> = HashSet::new();
    let mut frontier_set: HashSet<u32> = HashSet::new();

    for &(x, y) in frontier {
        frontier_set.insert(cell_key(x, y));
    }

    for &(sx, sy) in frontier {
        let start_key = cell_key(sx, sy);
        if visited.contains(&start_key) { continue; }

        let mut region = Vec::new();
        let mut queue = vec![(sx, sy)];
        let mut queue_set: HashSet<u32> = HashSet::new();
        queue_set.insert(start_key);

        while let Some((cx, cy)) = queue.pop() {
            let ck = cell_key(cx, cy);
            if visited.contains(&ck) { continue; }
            visited.insert(ck);
            region.push((cx, cy));

            // Find connected frontier cells via shared constraints
            for &(nx, ny) in nc.get(cx, cy) {
                if visible.get(nx, ny) <= 0 { continue; }
                // nx,ny is a constraint cell
                for &(hnx, hny) in nc.get(nx, ny) {
                    let hk = cell_key(hnx, hny);
                    if !visited.contains(&hk) && !queue_set.contains(&hk) && frontier_set.contains(&hk) {
                        queue.push((hnx, hny));
                        queue_set.insert(hk);
                    }
                }
            }
        }

        if !region.is_empty() {
            regions.push(region);
        }
    }

    regions
}

/// Constraint for a region: a revealed number cell with its relationship to the region.
struct RegionConstraint {
    remaining: i32,
    cells_in_region_indices: Vec<usize>,
    cells_outside_count: usize,
}

fn get_region_constraints(
    region: &[(usize, usize)],
    visible: &VisibleGrid,
    flags: &Flags,
    nc: &NeighborCache,
) -> Vec<RegionConstraint> {
    let mut constraint_set: HashSet<u32> = HashSet::new();
    let mut constraints = Vec::new();

    let mut region_set: HashSet<u32> = HashSet::new();
    for &(rx, ry) in region {
        region_set.insert(cell_key(rx, ry));
    }

    for &(cx, cy) in region {
        for &(nx, ny) in nc.get(cx, cy) {
            let key = cell_key(nx, ny);
            let val = visible.get(nx, ny);
            if val <= 0 || constraint_set.contains(&key) { continue; }
            constraint_set.insert(key);

            let mut flagged_count = 0i32;
            let mut cells_in_region_indices = Vec::new();
            let mut cells_outside_count = 0usize;

            for &(cnx, cny) in nc.get(nx, ny) {
                if flags.get(cnx, cny) {
                    flagged_count += 1;
                } else if visible.get(cnx, cny) == -1 {
                    let cnk = cell_key(cnx, cny);
                    if region_set.contains(&cnk) {
                        // Find index in region
                        for (i, &(rx, ry)) in region.iter().enumerate() {
                            if rx == cnx && ry == cny {
                                cells_in_region_indices.push(i);
                                break;
                            }
                        }
                    } else {
                        cells_outside_count += 1;
                    }
                }
            }

            constraints.push(RegionConstraint {
                remaining: val as i32 - flagged_count,
                cells_in_region_indices,
                cells_outside_count,
            });
        }
    }

    constraints
}

/// Enumerate all valid mine configurations using bit masks.
fn enumerate_configurations(
    region: &[(usize, usize)],
    constraints: &[RegionConstraint],
    max_mines: usize,
) -> Vec<u32> {
    let total_combinations: u64 = 1u64 << region.len();
    if total_combinations > MAX_CONFIGURATIONS {
        return vec![];
    }

    let mut valid_masks = Vec::new();

    for mask in 0..total_combinations as u32 {
        let mine_count = mask.count_ones() as usize;
        if mine_count > max_mines { continue; }

        let mut valid = true;
        for c in constraints {
            let mut mines_in_region = 0i32;
            for &idx in &c.cells_in_region_indices {
                if (mask >> idx) & 1 == 1 {
                    mines_in_region += 1;
                }
            }
            let mines_needed_outside = c.remaining - mines_in_region;
            if mines_needed_outside < 0 || mines_needed_outside > c.cells_outside_count as i32 {
                valid = false;
                break;
            }
        }

        if valid {
            valid_masks.push(mask);
        }
    }

    valid_masks
}

/// Analyze configurations to find cells that are ALWAYS mine or ALWAYS safe.
fn analyze_configurations(
    region: &[(usize, usize)],
    valid_masks: &[u32],
) -> (Vec<(usize, usize)>, Vec<(usize, usize)>) {
    let mut definite_mines = Vec::new();
    let mut definite_safes = Vec::new();

    for i in 0..region.len() {
        let mut always_mine = true;
        let mut always_safe = true;

        for &mask in valid_masks {
            if (mask >> i) & 1 == 0 { always_mine = false; }
            if (mask >> i) & 1 == 1 { always_safe = false; }
        }

        if always_mine { definite_mines.push(region[i]); }
        if always_safe { definite_safes.push(region[i]); }
    }

    (definite_mines, definite_safes)
}

// ─── Strategy 6: Global Mine Count ─────────────────────────────────────────

struct GlobalResult {
    progress: bool,
    flag_count: u32,
}

fn apply_global_mine_count(
    grid: &Grid,
    visible: &mut VisibleGrid,
    flags: &mut Flags,
    nc: &NeighborCache,
    bomb_count: usize,
    flag_count: u32,
) -> GlobalResult {
    let width = grid.width;
    let height = grid.height;
    let mut hidden_cells: Vec<(usize, usize)> = Vec::new();

    for x in 0..width {
        for y in 0..height {
            if visible.get(x, y) == -1 && !flags.get(x, y) {
                hidden_cells.push((x, y));
            }
        }
    }

    let remaining_mines = bomb_count as i32 - flag_count as i32;
    let mut fc = flag_count;

    if !hidden_cells.is_empty() {
        if remaining_mines == hidden_cells.len() as i32 {
            // All hidden cells are mines
            for &(hx, hy) in &hidden_cells {
                flags.set(hx, hy, true);
                fc += 1;
            }
            return GlobalResult { progress: true, flag_count: fc };
        } else if remaining_mines == 0 {
            // All hidden cells are safe
            for &(hx, hy) in &hidden_cells {
                simulate_reveal(grid, visible, flags, hx, hy);
            }
            return GlobalResult { progress: true, flag_count: fc };
        }
    }

    // Suppress unused variable warning — nc is passed for API consistency
    let _ = nc;

    GlobalResult { progress: false, flag_count: fc }
}

// ─── Top-level: is_solvable ─────────────────────────────────────────────────

/// Check if a board is solvable without guessing from the given start position.
///
/// This is the main entry point, mirroring `MinesweeperSolver.isSolvable()`.
/// Simulates revealing the 3×3 safe zone, then iteratively applies all strategies.
pub fn is_solvable(
    grid: &Grid,
    mines: &Mines,
    nc: &NeighborCache,
    start_x: usize,
    start_y: usize,
) -> bool {
    let width = grid.width;
    let height = grid.height;
    let bomb_count = mines.count();

    let mut visible = VisibleGrid::new(width, height);
    let mut flags = Flags::new(width, height);
    let mut flag_count: u32 = 0;

    // Reveal 3×3 safe zone around start
    for dx in -1i32..=1 {
        for dy in -1i32..=1 {
            let sx = start_x as i32 + dx;
            let sy = start_y as i32 + dy;
            if sx >= 0 && sx < width as i32 && sy >= 0 && sy < height as i32 {
                simulate_reveal(grid, &mut visible, &flags, sx as usize, sy as usize);
            }
        }
    }

    // Build initial dirty cells
    let mut dirty_cells: HashSet<u32> = HashSet::new();
    for x in 0..width {
        for y in 0..height {
            if visible.get(x, y) != -1 {
                dirty_cells.insert(cell_key(x, y));
                for &(nx, ny) in nc.get(x, y) {
                    dirty_cells.insert(cell_key(nx, ny));
                }
            }
        }
    }

    let max_iterations = width * height * 2;
    let mut progress = true;
    let mut iterations = 0;

    while progress && iterations < max_iterations {
        progress = false;
        iterations += 1;

        // Strategy 1: Basic counting rules (fast)
        let basic = apply_basic_rules(grid, &mut visible, &mut flags, nc, &dirty_cells, flag_count);
        if basic.progress {
            progress = true;
            flag_count = basic.flag_count;
            dirty_cells = basic.dirty_cells;
            continue;
        }

        // Strategy 2: Subset logic
        let subset = apply_subset_logic(grid, &mut visible, &mut flags, nc, &dirty_cells, flag_count);
        if subset.progress {
            progress = true;
            flag_count = subset.flag_count;
            dirty_cells = subset.dirty_cells;
            continue;
        }

        // Strategy 3: Gaussian Elimination
        let gauss = solve_by_gaussian_elimination(grid, &mut visible, &mut flags, nc, flag_count);
        if gauss.progress {
            progress = true;
            flag_count = gauss.flag_count;
            for &(cx, cy) in &gauss.changed_cells {
                dirty_cells.insert(cell_key(cx, cy));
                for &(nx, ny) in nc.get(cx, cy) {
                    dirty_cells.insert(cell_key(nx, ny));
                }
            }
            continue;
        }

        // Strategy 4: Proof by contradiction
        let contra = solve_by_contradiction(grid, &mut visible, &mut flags, nc, flag_count);
        if contra.progress {
            progress = true;
            flag_count = contra.flag_count;
            if let Some((cx, cy)) = contra.changed_cell {
                dirty_cells.insert(cell_key(cx, cy));
                for &(nx, ny) in nc.get(cx, cy) {
                    dirty_cells.insert(cell_key(nx, ny));
                }
            }
            continue;
        }

        // Strategy 5: Tank Solver
        let tank = tank_solver(grid, &mut visible, &mut flags, nc, bomb_count, flag_count);
        if tank.progress {
            progress = true;
            flag_count = tank.flag_count;
            for &(cx, cy) in &tank.changed_cells {
                dirty_cells.insert(cell_key(cx, cy));
                for &(nx, ny) in nc.get(cx, cy) {
                    dirty_cells.insert(cell_key(nx, ny));
                }
            }
            continue;
        }

        // Strategy 6: Global mine counting
        let global = apply_global_mine_count(grid, &mut visible, &mut flags, nc, bomb_count, flag_count);
        if global.progress {
            progress = true;
            flag_count = global.flag_count;
            continue;
        }
    }

    // Check if all non-mine cells are revealed
    let mut revealed = 0usize;
    for x in 0..width {
        for y in 0..height {
            if visible.get(x, y) != -1 {
                revealed += 1;
            }
        }
    }

    revealed == (width * height - bomb_count)
}

// ─── get_hint ───────────────────────────────────────────────────────────────

/// Hint result for the UI.
pub struct Hint {
    pub x: usize,
    pub y: usize,
    pub score: i32,
}

/// Find the best safe cell to reveal (God Mode / Best Move).
///
/// Prioritizes: frontier safe cells > zero cells > island safe cells.
pub fn get_hint(
    grid: &Grid,
    visible: &VisibleGrid,
    flags: &Flags,
    mines: &Mines,
    nc: &NeighborCache,
) -> Option<Hint> {
    let width = grid.width;
    let height = grid.height;

    // Phase 1: Safe frontier cells (adjacent to revealed cells)
    let mut safe_frontier: Vec<Hint> = Vec::new();

    for x in 0..width {
        for y in 0..height {
            if visible.get(x, y) == -1 && !flags.get(x, y) && !mines.get(x, y) {
                let neighbors = nc.get(x, y);
                let revealed_count = neighbors.iter()
                    .filter(|&&(nx, ny)| visible.get(nx, ny) > -1)
                    .count();

                if revealed_count > 0 {
                    let mut score = revealed_count as i32;
                    if grid.get(x, y) == 0 { score += 10; } // Prefer zeros (cascade)
                    safe_frontier.push(Hint { x, y, score });
                }
            }
        }
    }

    if !safe_frontier.is_empty() {
        safe_frontier.sort_by(|a, b| b.score.cmp(&a.score));
        return Some(safe_frontier.remove(0));
    }

    // Phase 2: Any safe cell (island, not adjacent to revealed)
    let mut safe_island: Vec<Hint> = Vec::new();

    for x in 0..width {
        for y in 0..height {
            if visible.get(x, y) == -1 && !flags.get(x, y) && !mines.get(x, y) {
                let score = if grid.get(x, y) == 0 { 10 } else { 0 };
                safe_island.push(Hint { x, y, score });
            }
        }
    }

    if !safe_island.is_empty() {
        safe_island.sort_by(|a, b| b.score.cmp(&a.score));
        return Some(safe_island.remove(0));
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create a simple 3x3 board with one mine at (0,0), start at (2,2).
    fn make_simple_board() -> (Grid, Mines, NeighborCache) {
        let mut mines = Mines::new(3, 3);
        mines.set(0, 0, true);

        let nc = NeighborCache::new(3, 3);
        let grid = crate::board::calculate_numbers(&mines, &nc);

        (grid, mines, nc)
    }

    #[test]
    fn test_simulate_reveal_zero_cascade() {
        let (grid, _mines, _nc) = make_simple_board();
        let flags = Flags::new(3, 3);
        let mut visible = VisibleGrid::new(3, 3);

        // Reveal (2,2) which is 0 → should cascade
        simulate_reveal(&grid, &mut visible, &flags, 2, 2);

        // (2,2) is 0, so all connected zeros and their neighbors should be revealed
        assert_ne!(visible.get(2, 2), -1);
    }

    #[test]
    fn test_is_solvable_simple() {
        let (grid, mines, nc) = make_simple_board();
        // 3x3 with 1 mine at (0,0), start at (2,2)
        // Basic rules should trivially solve this
        assert!(is_solvable(&grid, &mines, &nc, 2, 2));
    }

    #[test]
    fn test_get_hint_finds_safe() {
        let (grid, mines, nc) = make_simple_board();
        let visible = VisibleGrid::new(3, 3);
        let flags = Flags::new(3, 3);

        let hint = get_hint(&grid, &visible, &flags, &mines, &nc);
        assert!(hint.is_some());
        let h = hint.unwrap();
        // Should not suggest (0,0) which is a mine
        assert!(!(h.x == 0 && h.y == 0));
    }

    #[test]
    fn test_enumerate_configurations() {
        // 2 cells, constraint: exactly 1 mine among both
        let region = vec![(0usize, 0usize), (1, 0)];
        let constraints = vec![RegionConstraint {
            remaining: 1,
            cells_in_region_indices: vec![0, 1],
            cells_outside_count: 0,
        }];

        let configs = enumerate_configurations(&region, &constraints, 5);
        // Valid: 01 (mask=1) and 10 (mask=2)
        assert_eq!(configs.len(), 2);
        assert!(configs.contains(&1)); // cell 0 is mine
        assert!(configs.contains(&2)); // cell 1 is mine
    }

    #[test]
    fn test_analyze_finds_definite() {
        let region = vec![(0usize, 0usize), (1, 0), (2, 0)];
        // All configs have cell 0 as mine, cell 2 as safe
        let valid_masks = vec![
            0b001, // only cell 0 is mine
            0b011, // cells 0 and 1 are mines
        ];

        let (definite_mines, definite_safes) = analyze_configurations(&region, &valid_masks);
        assert!(definite_mines.contains(&(0, 0))); // always mine
        assert!(definite_safes.contains(&(2, 0))); // always safe
    }
}
