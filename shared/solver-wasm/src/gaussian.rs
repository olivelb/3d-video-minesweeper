//! Gaussian Elimination strategy for Minesweeper.
//!
//! Ports the optimized GaussianElimination.js implementation.
//! Solves the frontier as a system of linear equations: Ax = b,
//! where x are hidden cells (0=safe, 1=mine), A is connectivity, b is effective clues.

use crate::types::{cell_key, Flags, NeighborCache, VisibleGrid};
use std::collections::HashSet;

/// Result from Gaussian elimination: cells proven to be safe or mines.
pub struct GaussianResult {
    pub progress: bool,
    pub safe: Vec<(usize, usize)>,
    pub mines: Vec<(usize, usize)>,
}

/// Maximum component size before windowing kicks in.
const MAX_COMPONENT_SIZE: usize = 50;

/// Epsilon for floating point comparisons.
const EPS: f32 = 0.001;
const EPS_TINY: f32 = 0.000001;

/// Solve the frontier using Gaussian Elimination.
///
/// 1. Decompose frontier into connected components
/// 2. Solve each component (with windowing for large ones)
/// 3. Aggregate results
pub fn solve(
    visible: &VisibleGrid,
    flags: &Flags,
    frontier: &[(usize, usize)],
    nc: &NeighborCache,
) -> GaussianResult {
    if frontier.is_empty() {
        return GaussianResult { progress: false, safe: vec![], mines: vec![] };
    }

    let width = visible.width;
    let height = visible.height;

    // 1. Decompose into connected components
    let components = get_connected_components(visible, frontier, nc, width, height);

    let mut all_safe: HashSet<u32> = HashSet::new();
    let mut all_mines: HashSet<u32> = HashSet::new();
    let mut safe_list = Vec::new();
    let mut mine_list = Vec::new();

    // 2. Solve each component
    for component in &components {
        if component.len() > MAX_COMPONENT_SIZE {
            let result = solve_large_component(visible, flags, component, MAX_COMPONENT_SIZE, nc);
            if result.progress {
                for &(x, y) in &result.safe {
                    let key = cell_key(x, y);
                    if all_safe.insert(key) { safe_list.push((x, y)); }
                }
                for &(x, y) in &result.mines {
                    let key = cell_key(x, y);
                    if all_mines.insert(key) { mine_list.push((x, y)); }
                }
            }
        } else {
            let result = solve_component(visible, flags, component, nc);
            if result.progress {
                for &(x, y) in &result.safe {
                    let key = cell_key(x, y);
                    if all_safe.insert(key) { safe_list.push((x, y)); }
                }
                for &(x, y) in &result.mines {
                    let key = cell_key(x, y);
                    if all_mines.insert(key) { mine_list.push((x, y)); }
                }
            }
        }
    }

    let progress = !safe_list.is_empty() || !mine_list.is_empty();
    GaussianResult { progress, safe: safe_list, mines: mine_list }
}

/// Decompose the frontier into connected components using BFS.
/// Two frontier cells are connected if they share a constraint (adjacent to the same clue).
fn get_connected_components(
    visible: &VisibleGrid,
    frontier: &[(usize, usize)],
    nc: &NeighborCache,
    width: usize,
    height: usize,
) -> Vec<Vec<(usize, usize)>> {
    let mut components = Vec::new();
    // 0 = not frontier, 1 = frontier (unvisited), 2 = visited
    let mut frontier_map = vec![0u8; width * height];

    for &(x, y) in frontier {
        frontier_map[x * height + y] = 1;
    }

    for &(x, y) in frontier {
        let idx = x * height + y;
        if frontier_map[idx] == 2 { continue; } // Already visited

        let mut component = Vec::new();
        let mut queue = Vec::new();

        frontier_map[idx] = 2;
        queue.push((x, y));
        component.push((x, y));

        let mut head = 0;
        while head < queue.len() {
            let (cx, cy) = queue[head];
            head += 1;

            // Get clues adjacent to this frontier cell
            for &(nx, ny) in nc.get(cx, cy) {
                if visible.get(nx, ny) > 0 {
                    // This neighbor is a clue — get its hidden neighbors
                    for &(hx, hy) in nc.get(nx, ny) {
                        let h_idx = hx * height + hy;
                        if frontier_map[h_idx] == 1 {
                            frontier_map[h_idx] = 2;
                            queue.push((hx, hy));
                            component.push((hx, hy));
                        }
                    }
                }
            }
        }

        components.push(component);
    }

    components
}

/// Solve a large component by splitting into overlapping windows.
fn solve_large_component(
    visible: &VisibleGrid,
    flags: &Flags,
    big_component: &[(usize, usize)],
    window_size: usize,
    nc: &NeighborCache,
) -> GaussianResult {
    // Sort for spatial locality (row-major: by y then x)
    let mut sorted = big_component.to_vec();
    sorted.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.cmp(&b.0)));

    let mut safe_set: HashSet<u32> = HashSet::new();
    let mut mine_set: HashSet<u32> = HashSet::new();
    let mut safe_list = Vec::new();
    let mut mine_list = Vec::new();

    let step = window_size / 2;
    let mut i = 0;

    while i < sorted.len() {
        let end = (i + window_size).min(sorted.len());
        let chunk = &sorted[i..end];
        if chunk.is_empty() { break; }

        let result = solve_component(visible, flags, chunk, nc);
        if result.progress {
            for &(x, y) in &result.safe {
                if safe_set.insert(cell_key(x, y)) { safe_list.push((x, y)); }
            }
            for &(x, y) in &result.mines {
                if mine_set.insert(cell_key(x, y)) { mine_list.push((x, y)); }
            }
        }

        i += step;
    }

    let progress = !safe_list.is_empty() || !mine_list.is_empty();
    GaussianResult { progress, safe: safe_list, mines: mine_list }
}

/// Solve a single connected component using Gaussian elimination.
fn solve_component(
    visible: &VisibleGrid,
    flags: &Flags,
    component: &[(usize, usize)],
    nc: &NeighborCache,
) -> GaussianResult {
    let width = visible.width;
    let height = visible.height;
    let num_vars = component.len();
    if num_vars == 0 {
        return GaussianResult { progress: false, safe: vec![], mines: vec![] };
    }

    // 1. Build variable index map: (x,y) -> column index
    let mut var_index_map = vec![-1i16; width * height];
    for (i, &(x, y)) in component.iter().enumerate() {
        var_index_map[x * height + y] = i as i16;
    }

    // 2. Build equations from clues adjacent to component variables
    struct Equation {
        neighbors: Vec<usize>, // variable indices
        target: f32,
    }
    let mut equations: Vec<Equation> = Vec::new();
    let mut processed_clues = vec![false; width * height];

    for &(cx, cy) in component {
        for &(nx, ny) in nc.get(cx, cy) {
            let val = visible.get(nx, ny);
            if val <= 0 { continue; }

            let clue_idx = nx * height + ny;
            if processed_clues[clue_idx] { continue; }
            processed_clues[clue_idx] = true;

            let mut eq_neighbors = Vec::new();
            let mut flagged_count = 0i8;
            let mut valid = true;

            for &(cnx, cny) in nc.get(nx, ny) {
                if flags.get(cnx, cny) {
                    flagged_count += 1;
                } else if visible.get(cnx, cny) == -1 {
                    let v_idx = var_index_map[cnx * height + cny];
                    if v_idx != -1 {
                        eq_neighbors.push(v_idx as usize);
                    } else {
                        // Hidden neighbor not in our component — can't use this clue
                        valid = false;
                        break;
                    }
                }
            }

            if valid {
                equations.push(Equation {
                    neighbors: eq_neighbors,
                    target: (val - flagged_count) as f32,
                });
            }
        }
    }

    if equations.is_empty() {
        return GaussianResult { progress: false, safe: vec![], mines: vec![] };
    }

    // 3. Construct matrix M × (N+1)
    let m = equations.len();
    let n = num_vars;
    let cols = n + 1;
    let mut matrix: Vec<Vec<f32>> = Vec::with_capacity(m);

    for eq in &equations {
        let mut row = vec![0.0f32; cols];
        for &idx in &eq.neighbors {
            row[idx] = 1.0;
        }
        row[n] = eq.target;
        matrix.push(row);
    }

    // 4. Compute RREF
    compute_rref(&mut matrix, m, n);

    // 5. Reason about results
    let mut safe = Vec::new();
    let mut mines = Vec::new();

    for row in &matrix {
        let target = row[n];
        let mut min_val: f32 = 0.0;
        let mut max_val: f32 = 0.0;
        let mut has_nonzero = false;
        let mut vars_in_row: Vec<usize> = Vec::new();

        for j in 0..n {
            let coeff = row[j];
            if coeff.abs() > EPS {
                has_nonzero = true;
                if coeff > 0.0 { max_val += coeff; }
                else { min_val += coeff; }
                vars_in_row.push(j);
            }
        }

        if !has_nonzero { continue; }

        if (target - min_val).abs() < EPS {
            // All negative coeffs are MINES, positive are SAFE
            for &idx in &vars_in_row {
                let coeff = row[idx];
                let cell = component[idx];
                if coeff < 0.0 {
                    mines.push(cell);
                } else {
                    safe.push(cell);
                }
            }
        } else if (target - max_val).abs() < EPS {
            // All positive coeffs are MINES, negative are SAFE
            for &idx in &vars_in_row {
                let coeff = row[idx];
                let cell = component[idx];
                if coeff > 0.0 {
                    mines.push(cell);
                } else {
                    safe.push(cell);
                }
            }
        }
    }

    // Deduplicate via HashSet
    let mut safe_set = HashSet::new();
    let mut mine_set = HashSet::new();
    safe.retain(|&(x, y)| safe_set.insert(cell_key(x, y)));
    mines.retain(|&(x, y)| mine_set.insert(cell_key(x, y)));

    let progress = !safe.is_empty() || !mines.is_empty();
    GaussianResult { progress, safe, mines }
}

/// Compute Reduced Row Echelon Form (RREF) in-place.
/// Standard Gaussian elimination with partial pivoting.
fn compute_rref(matrix: &mut [Vec<f32>], m: usize, n: usize) {
    let mut lead = 0usize;

    for r in 0..m {
        if n <= lead { return; }

        let mut i = r;
        while matrix[i][lead].abs() < EPS_TINY {
            i += 1;
            if m == i {
                i = r;
                lead += 1;
                if n == lead { return; }
            }
        }

        if i != r {
            matrix.swap(i, r);
        }

        let val = matrix[r][lead];
        if val.abs() < EPS_TINY {
            lead += 1;
            continue; // r will not be incremented because this is a for loop — need to handle differently
        }

        // Normalize pivot row
        let inv = 1.0 / val;
        for j in 0..=n {
            matrix[r][j] *= inv;
        }

        // Eliminate all other rows
        for k in 0..m {
            if k != r {
                let factor = matrix[k][lead];
                if factor.abs() > EPS_TINY {
                    for j in 0..=n {
                        matrix[k][j] -= factor * matrix[r][j];
                    }
                }
            }
        }

        lead += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rref_simple() {
        // Simple 2x2 system: x + y = 1, x = 1  => x=1, y=0
        let mut matrix = vec![
            vec![1.0, 1.0, 1.0],
            vec![1.0, 0.0, 1.0],
        ];
        compute_rref(&mut matrix, 2, 2);
        // After RREF: row0 should be [1, 0, 1], row1 should be [0, 1, 0]
        assert!((matrix[0][0] - 1.0).abs() < EPS);
        assert!((matrix[0][1] - 0.0).abs() < EPS);
        assert!((matrix[0][2] - 1.0).abs() < EPS);
        assert!((matrix[1][0] - 0.0).abs() < EPS);
        assert!((matrix[1][1] - 1.0).abs() < EPS);
        assert!((matrix[1][2] - 0.0).abs() < EPS);
    }

    #[test]
    fn test_rref_underdetermined() {
        // x + y = 1 (underdetermined, 1 eq, 2 vars)
        let mut matrix = vec![
            vec![1.0, 1.0, 1.0],
        ];
        compute_rref(&mut matrix, 1, 2);
        assert!((matrix[0][0] - 1.0).abs() < EPS);
        assert!((matrix[0][1] - 1.0).abs() < EPS);
        assert!((matrix[0][2] - 1.0).abs() < EPS);
    }

    #[test]
    fn test_component_detection() {
        // Create a simple 3x3 grid with center revealed as "1"
        let mut visible = VisibleGrid::new(3, 3);
        visible.set(1, 1, 1); // Center is revealed "1"

        let nc = NeighborCache::new(3, 3);

        // Frontier: all hidden cells adjacent to the revealed "1"
        let frontier: Vec<(usize, usize)> = vec![
            (0,0), (0,1), (0,2),
            (1,0),        (1,2),
            (2,0), (2,1), (2,2),
        ];

        let components = get_connected_components(&visible, &frontier, &nc, 3, 3);
        // All frontier cells share the same constraint (the center "1")
        assert_eq!(components.len(), 1);
        assert_eq!(components[0].len(), 8);
    }
}
