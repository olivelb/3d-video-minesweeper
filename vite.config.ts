import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    root: '.',
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
    resolve: {
        alias: {
            'three/addons/': path.resolve(__dirname, 'node_modules/three/examples/jsm/'),
        }
    },
    server: {
        open: '/index.html',
    }
});
