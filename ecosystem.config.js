module.exports = {
  apps: [{
    name: 'backend',
    script: './src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
  NODE_ENV:     'production',
  PORT:         3000,
  FRONTEND_URL: 'http://34.35.117.73',
  DB_HOST:      '34.35.131.252',
  DB_PORT:      '3306',
  DB_USER:      'todo_user',
  DB_PASSWORD:  'xahavi2026',
  DB_NAME:      'tododb',
}
  }]
};