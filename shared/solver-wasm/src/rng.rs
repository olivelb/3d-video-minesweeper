//! WASM-compatible random number generator.
//!
//! Uses the `rand` crate with `SmallRng` (xoshiro256++) which is fast and
//! works with WASM. Entropy is sourced from `getrandom` (browser crypto API).

use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};

/// A seedable RNG wrapper for WASM.
///
/// Can be seeded for deterministic replay, or created from system entropy.
pub struct WasmRng {
    inner: SmallRng,
}

impl WasmRng {
    /// Create from system entropy (browser crypto.getRandomValues or OS).
    pub fn new() -> Self {
        Self {
            inner: SmallRng::from_os_rng(),
        }
    }

    /// Create with a specific seed for deterministic behavior.
    #[allow(dead_code)]
    pub fn from_seed(seed: u64) -> Self {
        Self {
            inner: SmallRng::seed_from_u64(seed),
        }
    }

    /// Generate a random usize in [0, max).
    #[inline(always)]
    pub fn gen_range(&mut self, max: usize) -> usize {
        self.inner.random_range(0..max)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seeded_deterministic() {
        let mut rng1 = WasmRng::from_seed(42);
        let mut rng2 = WasmRng::from_seed(42);
        for _ in 0..100 {
            assert_eq!(rng1.gen_range(1000), rng2.gen_range(1000));
        }
    }

    #[test]
    fn test_range_bounds() {
        let mut rng = WasmRng::from_seed(123);
        for _ in 0..1000 {
            let v = rng.gen_range(10);
            assert!(v < 10);
        }
    }
}
