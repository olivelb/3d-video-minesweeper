import { defineConfig } from 'vite';
import path from 'path';
import { cpSync } from 'fs';

// Custom plugin to copy static asset directories to dist
function copyStaticAssets() {
    const dirs = ['images', 'css'];
    const files = ['.nojekyll'];
    return {
        name: 'copy-static-assets',
        closeBundle() {
            for (const dir of dirs) {
                cpSync(path.resolve(__dirname, dir), path.resolve(__dirname, 'dist', dir), { recursive: true });
            }
            for (const file of files) {
                try {
                    cpSync(path.resolve(__dirname, file), path.resolve(__dirname, 'dist', file));
                } catch { /* optional files */ }
            }
        }
    };
}

export default defineConfig({
    root: '.',
    base: process.env.BASE_URL || '/',
    build: {
        outDir: 'dist',
        sourcemap: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
                analytics: path.resolve(__dirname, 'analytics.html'),
            },
        },
    },
    resolve: {
        alias: {
            'three/addons/': path.resolve(__dirname, 'node_modules/three/examples/jsm/'),
        }
    },
    plugins: [copyStaticAssets()],
    server: {
        open: '/index.html',
    }
});
