module.exports = {
    apps: [
        {
            name: 'minesweeper-multiplayer',
            script: './server-multiplayer/server.js',
            cwd: './',
            env: {
                PORT: 3001,
                NODE_ENV: 'production'
            }
        },
        {
            name: 'minesweeper-server',
            script: './server/index.js',
            cwd: './',
            env: {
                PORT: 3002,
                NODE_ENV: 'development'
            }
        }
    ]
};
