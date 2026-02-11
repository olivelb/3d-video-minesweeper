//! Core data types for the Minesweeper solver.
//!
//! All grid types use flat `Vec` storage with column-major layout:
//! `cells[x * height + y]` maps to the JS equivalent `grid[x][y]`.

/// Bit-pack (x, y) into a single u32 key, matching JS `(x << 16) | y`.
#[inline(always)]
pub fn cell_key(x: usize, y: usize) -> u32 {
    ((x as u32) << 16) | (y as u32)
}

/// Decode a packed cell key back to (x, y).
#[inline(always)]
pub fn decode_key(key: u32) -> (usize, usize) {
    ((key >> 16) as usize, (key & 0xFFFF) as usize)
}

/// The actual grid values: 0 = empty, 1-8 = neighbor mine count.
/// For mine cells during placement, the value is set to the count after `calculate_numbers`.
#[derive(Clone)]
pub struct Grid {
    pub width: usize,
    pub height: usize,
    pub cells: Vec<i8>,
}

impl Grid {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            cells: vec![0; width * height],
        }
    }

    #[inline(always)]
    pub fn get(&self, x: usize, y: usize) -> i8 {
        self.cells[x * self.height + y]
    }

    #[inline(always)]
    pub fn set(&mut self, x: usize, y: usize, val: i8) {
        self.cells[x * self.height + y] = val;
    }

    #[inline(always)]
    pub fn in_bounds(&self, x: usize, y: usize) -> bool {
        x < self.width && y < self.height
    }
}

/// Visible state of each cell: -1 = hidden, 0-8 = revealed number, 9 = exploded bomb.
#[derive(Clone)]
pub struct VisibleGrid {
    pub width: usize,
    pub height: usize,
    pub cells: Vec<i8>,
}

impl VisibleGrid {
    /// Create a new grid with all cells hidden (-1).
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            cells: vec![-1; width * height],
        }
    }

    #[inline(always)]
    pub fn get(&self, x: usize, y: usize) -> i8 {
        self.cells[x * self.height + y]
    }

    #[inline(always)]
    pub fn set(&mut self, x: usize, y: usize, val: i8) {
        self.cells[x * self.height + y] = val;
    }
}

/// Boolean flag state for each cell.
/// Uses `Vec<u8>` (0/1) instead of `Vec<bool>` for simpler WASM interop.
#[derive(Clone)]
pub struct Flags {
    pub width: usize,
    pub height: usize,
    pub cells: Vec<u8>,
}

impl Flags {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            cells: vec![0; width * height],
        }
    }

    #[inline(always)]
    pub fn get(&self, x: usize, y: usize) -> bool {
        self.cells[x * self.height + y] != 0
    }

    #[inline(always)]
    pub fn set(&mut self, x: usize, y: usize, val: bool) {
        self.cells[x * self.height + y] = val as u8;
    }
}

/// Mine positions for each cell (same layout as Flags).
#[derive(Clone)]
pub struct Mines {
    pub width: usize,
    pub height: usize,
    pub cells: Vec<u8>,
}

impl Mines {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            cells: vec![0; width * height],
        }
    }

    #[inline(always)]
    pub fn get(&self, x: usize, y: usize) -> bool {
        self.cells[x * self.height + y] != 0
    }

    #[inline(always)]
    pub fn set(&mut self, x: usize, y: usize, val: bool) {
        self.cells[x * self.height + y] = val as u8;
    }

    /// Count total mines on the board.
    pub fn count(&self) -> usize {
        self.cells.iter().filter(|&&v| v != 0).count()
    }
}

/// Pre-computed neighbor cache for all cells.
///
/// Stores the 8-directional neighbors (clipped to grid bounds) for every cell.
/// Indexed by `x * height + y`, each entry is a slice of `(nx, ny)` pairs.
pub struct NeighborCache {
    pub width: usize,
    pub height: usize,
    /// Flat storage of all neighbor pairs.
    data: Vec<(usize, usize)>,
    /// offsets[i] = start index in `data` for cell i.
    /// offsets[i+1] - offsets[i] = number of neighbors for cell i.
    offsets: Vec<usize>,
}

impl NeighborCache {
    /// Build the neighbor cache for a grid of the given dimensions.
    pub fn new(width: usize, height: usize) -> Self {
        let total = width * height;
        // Each cell has at most 8 neighbors, pre-allocate generously
        let mut data = Vec::with_capacity(total * 8);
        let mut offsets = Vec::with_capacity(total + 1);

        for x in 0..width {
            for y in 0..height {
                offsets.push(data.len());
                for dx in -1i32..=1 {
                    for dy in -1i32..=1 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        let nx = x as i32 + dx;
                        let ny = y as i32 + dy;
                        if nx >= 0 && nx < width as i32 && ny >= 0 && ny < height as i32 {
                            data.push((nx as usize, ny as usize));
                        }
                    }
                }
            }
        }
        offsets.push(data.len()); // sentinel

        Self {
            width,
            height,
            data,
            offsets,
        }
    }

    /// Get the pre-computed neighbors for cell (x, y).
    #[inline(always)]
    pub fn get(&self, x: usize, y: usize) -> &[(usize, usize)] {
        let idx = x * self.height + y;
        let start = self.offsets[idx];
        let end = self.offsets[idx + 1];
        &self.data[start..end]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cell_key_roundtrip() {
        for x in 0..50 {
            for y in 0..50 {
                let key = cell_key(x, y);
                let (dx, dy) = decode_key(key);
                assert_eq!((x, y), (dx, dy));
            }
        }
    }

    #[test]
    fn test_grid_get_set() {
        let mut g = Grid::new(10, 8);
        g.set(3, 5, 7);
        assert_eq!(g.get(3, 5), 7);
        assert_eq!(g.get(0, 0), 0);
    }

    #[test]
    fn test_neighbor_cache_corners() {
        let nc = NeighborCache::new(5, 5);
        // Corner (0,0) should have 3 neighbors
        assert_eq!(nc.get(0, 0).len(), 3);
        // Edge (0,2) should have 5 neighbors
        assert_eq!(nc.get(0, 2).len(), 5);
        // Center (2,2) should have 8 neighbors
        assert_eq!(nc.get(2, 2).len(), 8);
    }

    #[test]
    fn test_neighbor_cache_matches_js_order() {
        // JS iterates dx=-1..1, dy=-1..1, skipping (0,0)
        // Verify our cache produces valid neighbors
        let nc = NeighborCache::new(10, 10);
        for &(nx, ny) in nc.get(5, 5) {
            assert!(nx < 10 && ny < 10);
            let dx = nx as i32 - 5;
            let dy = ny as i32 - 5;
            assert!(dx.abs() <= 1 && dy.abs() <= 1);
            assert!(dx != 0 || dy != 0);
        }
    }

    #[test]
    fn test_mines_count() {
        let mut m = Mines::new(5, 5);
        m.set(0, 0, true);
        m.set(2, 3, true);
        m.set(4, 4, true);
        assert_eq!(m.count(), 3);
    }
}
