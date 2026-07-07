# Backend VM Setup — Step by Step

This guide walks through every command needed to set up the backend VM manually. Each command is explained so you know exactly what it does and why before you run it. All commands are run on the **backend VM** over SSH unless stated otherwise.

**VM details:**
- Public IP: `YOUR_BACKEND_VM_IP`
- OS: Ubuntu 22.04 (Azure)
- Login user: `your-azure-username`
- App: Node.js/Express backend serving `/api/todos` on port 3000

---

## Before You Start

Open VS Code, install the **Remote - SSH** extension if you haven't already, then connect to your backend VM:

1. Press `Ctrl + Shift + P` → type **Remote-SSH: Connect to Host** → Enter
2. Type `your-azure-username@YOUR_BACKEND_VM_IP` → Enter
3. VS Code will open a new window connected to the VM. Open the integrated terminal with `` Ctrl + ` ``

Once in the terminal, switch to root so you don't need to type `sudo` in front of every command:

```bash
sudo -i
```

> **Why root?** Most of what follows (installing packages, creating directories in `/var/www`, configuring Nginx, editing firewall rules) requires root permissions. It's cleaner to switch once than to prefix every command with `sudo`.

---

## Step 1 — Update the system and install required packages

**Refresh the package list:**
```bash
apt-get update -y
```

> Downloads the latest list of available packages from Ubuntu's repositories. Nothing is installed yet — this just updates the index.

**Upgrade installed packages:**
```bash
apt-get -o Dpkg::Options::="--force-confold" upgrade -y --no-install-recommends
```

> Upgrades everything currently installed to its latest version. `--force-confold` automatically keeps existing config files if a package tries to replace them (avoids another interactive prompt). `--no-install-recommends` skips optional packages to keep the system lean.

**Install the tools we need:**
```bash
apt-get install -y git curl build-essential nginx ufw
```

> - `git` — for cloning the repo and pulling updates during deploys
> - `curl` — used in the next step to download the Node.js installer
> - `build-essential` — C compiler toolchain, required by some npm packages that compile native code
> - `nginx` — the web server / reverse proxy that will sit in front of your Express app
> - `ufw` — Uncomplicated Firewall, used to open/close ports on the VM

---

## Step 2 — Install Node.js 20

**Download and run the NodeSource setup script:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
```

> NodeSource maintains up-to-date Node.js apt packages. This script adds their repository to apt so we can install Node 20 — Ubuntu's default `apt-get install nodejs` would give you a much older version.

**Install Node.js:**
```bash
apt-get install -y nodejs
```

**Confirm both Node and npm are installed:**
```bash
node -v && npm -v
```

> You should see something like `v20.x.x` and `10.x.x`. If either command fails, the install didn't complete — re-run the two steps above.

---

## Step 3 — Install PM2

```bash
npm install -g pm2
```

> Installs PM2 globally (the `-g` flag). PM2 is a process manager for Node.js apps — it keeps your Express server running in the background, restarts it if it crashes, and can start it automatically when the VM reboots. Think of it as a supervisor for your app.

---

## Step 4 — Create the app directory and set ownership

**Create the directory where the app will live:**
```bash
mkdir -p /var/www/backend
```

> `/var/www/` is the standard location for web application files on Linux. The `-p` flag creates parent directories if they don't already exist.

**Give your login user ownership of that directory:**
```bash
chown your-azure-username:your-azure-username /var/www/backend
```

> By default, directories created by root are owned by root. Your login user (`your-azure-username`) needs to own this directory so it can write files there — including during CI/CD deploys that SSH in as `your-azure-username`, not root.

---

## Step 5 — Clone the repository

```bash
sudo -u your-azure-username git clone --branch master https://github.com/VictorOjedokun/todo-backend.git /var/www/backend
```

> Clones the backend repo into `/var/www/backend`. `sudo -u your-azure-username` runs the command as your login user (not root) so the cloned files are owned by `your-azure-username` rather than root — important for file permission consistency later.

---

## Step 6 — Install dependencies

```bash
cd /var/www/backend
sudo -u your-azure-username npm ci --production
```

> `npm ci` installs exactly what's in `package-lock.json` — no more, no less. It's faster and more reliable than `npm install` for deployments because it never guesses at versions. `--production` skips `devDependencies` (things like test frameworks and linters that aren't needed at runtime).

---

## Step 7 — Create the PM2 config file

```bash
cat > /var/www/backend/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [{
    name: 'backend',
    script: './src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    }
  }]
};
EOF
```

> This file tells PM2 everything it needs to know about running your app:
> - `name: 'backend'` — the name used in `pm2 list`, `pm2 logs backend`, etc.
> - `script: './src/index.js'` — the entry point of your Express app (update this if your entry point is different, e.g. `./index.js` or `./app.js`)
> - `autorestart: true` — PM2 restarts the app if it crashes
> - `watch: false` — don't watch for file changes (that's handled by the CI/CD pipeline instead)
> - `NODE_ENV: 'production'` and `PORT: 3000` — environment variables passed to the app

**Give ownership of this file to your login user:**
```bash
chown your-azure-username:your-azure-username /var/www/backend/ecosystem.config.js
```

---

## Step 8 — Start the app with PM2

**Start the app:**
```bash
sudo -u your-azure-username pm2 start /var/www/backend/ecosystem.config.js
```

> Reads `ecosystem.config.js` and starts the Express app as a background process under PM2.

**Save the process list so PM2 knows what to restart on reboot:**
```bash
sudo -u your-azure-username pm2 save
```

> Saves a snapshot of all currently running PM2 processes. This is what PM2 reads on boot to know which apps to start.

**Register PM2 as a systemd service so it starts on VM reboot:**
```bash
env PATH=$PATH:/usr/bin pm2 startup systemd -u your-azure-username --hp /home/your-azure-username
systemctl enable pm2-your-azure-username
```

> `pm2 startup` generates and installs a systemd unit file that launches PM2 (and therefore your app) automatically whenever the VM reboots. `systemctl enable` makes sure that service is activated.

**Verify the app is running:**
```bash
sudo -u your-azure-username pm2 list
```

> You should see a row for `backend` with status `online`. If it shows `errored`, check the logs with `pm2 logs backend` to see what went wrong — usually a wrong entry point path in `ecosystem.config.js`.

---

## Step 9 — Allow the user to run PM2 and npm without a password

```bash
echo "your-azure-username ALL=(ALL) NOPASSWD: /usr/bin/pm2, /usr/bin/npm" > /etc/sudoers.d/app-deploy
chmod 0440 /etc/sudoers.d/app-deploy
```

> The CI/CD pipeline SSHes in as `your-azure-username` (not root) and needs to run `pm2 reload` and `npm ci` without being prompted for a password — there's no one there to type one. This sudoers rule grants exactly that, scoped only to those two commands, so the user doesn't get blanket root access.

---

## Step 10 — Configure Nginx as a reverse proxy

**Write the Nginx site config:**
```bash
cat > /etc/nginx/sites-available/backend <<'EOF'
server {
    listen 80;
    server_name YOUR_BACKEND_VM_IP;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
```

> This Nginx config tells the server: "when a request comes in on port 80, forward it to port 3000 on the same machine (where Express is listening)." The `proxy_set_header` lines pass the original request information through so your Express app can see the real client IP and protocol. Your Express app never needs to be exposed to the public internet directly — Nginx handles all incoming traffic.

**Enable the site by creating a symlink:**
```bash
ln -sf /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/backend
```

> Nginx reads config from `/etc/nginx/sites-enabled/`. Rather than copying the file there, we create a symlink pointing to the version in `sites-available/` — standard Ubuntu Nginx practice.

**Remove the default Nginx placeholder site:**
```bash
rm -f /etc/nginx/sites-enabled/default
```

> The default Nginx config serves a placeholder page. If left in place it will conflict with our config (both listening on port 80).

**Test the config and reload Nginx:**
```bash
nginx -t && systemctl reload nginx
```

> `nginx -t` validates the config file for syntax errors before doing anything — if it finds a problem it tells you exactly which line is wrong. `systemctl reload nginx` applies the new config without dropping existing connections (unlike `restart`).

---

## Step 11 — Configure the firewall

**Allow SSH through the firewall:**
```bash
ufw allow OpenSSH
```

> Opens port 22 so you can continue to SSH in. Always do this before enabling ufw — if you enable ufw without allowing SSH, you'll lock yourself out.

**Allow HTTP traffic:**
```bash
ufw allow 'Nginx HTTP'
```

> Opens port 80 so browsers can reach your app through Nginx.

**Enable the firewall:**
```bash
ufw --force enable
```

> Activates ufw with the rules above. `--force` skips the "are you sure?" prompt.

---

## Verify Everything is Working

```bash
# Check PM2 is running the app
pm2 list

# Tail live app logs
pm2 logs backend

# Check Nginx is running
systemctl status nginx

# Test the app responds locally (should return Express output)
curl http://localhost
```

Then open a browser and visit `http://YOUR_BACKEND_VM_IP` — you should see your Express app responding.

---

## After Setup: Add Your .env File

If your Express app needs environment variables (database URL, JWT secret, etc.), create a `.env` file on the VM:

```bash
nano /var/www/backend/.env
```

Then restart the app to pick up the new values:

```bash
sudo -u your-azure-username pm2 restart backend --update-env
```
