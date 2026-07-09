# Adding a Database — GCP Cloud SQL (MySQL)

This guide walks through creating a managed MySQL database on GCP Cloud SQL and wiring it into the backend Express app and CI/CD pipeline. No new VM needed — GCP hosts and manages the database for you.

> **Note:** The backend code (`src/db.js`, updated `src/index.js`, `mysql2` dependency) is already updated before this guide begins. This guide covers only the infrastructure setup, database creation, and CI/CD wiring.

---

## Important: Two Names, Don't Confuse Them

GCP Cloud SQL has two completely separate names that look similar but mean different things:

| Name | What it is | Example |
|---|---|---|
| **Instance ID** | The name of the Cloud SQL server in GCP | `todo-db` |
| **Database name** | The actual MySQL database created inside that server | `tododb` |

`DB_NAME` in your config and GitHub Secrets must be the **database name** (`tododb`), not the instance ID (`todo-db`). This is the single most common mistake — confusing the two causes an `Access denied` error even when credentials are correct.

---

## What Changes

```
Before:
  Browser → Frontend VM → Backend VM (todos stored in memory, lost on restart)

After:
  Browser → Frontend VM → Backend VM → Cloud SQL (MySQL)
                                        (managed by GCP, data persists)
```

The `ecosystem.config.js` is removed from the repo (the pipeline generates it with real credentials), and six GitHub Secrets are added for the DB credentials.

---

## Part 1: Create the Cloud SQL Instance on GCP

### Step 1 — Open Cloud SQL in the GCP Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. In the left menu, navigate to **SQL** (under Databases)
3. Click **Create Instance**

### Step 2 — Configure the instance

Select **MySQL**, then fill in:

| Setting | Value |
|---|---|
| Database version | **MySQL 8.4** (latest) |
| Instance ID | `todo-db` (this is just the GCP server name, not your DB name) |
| Password | Set a strong root password — save this somewhere safe |
| Region | Same region as your backend VM (e.g. `africa-south1`) |
| Zone | Any |
| Machine type | **Sandbox** (cheapest, fine for class projects) |
| Storage | 10 GB SSD (default is fine) |

Click **Create Instance** — this takes 3–5 minutes to provision.

### Step 3 — Allow your backend VM to connect

By default Cloud SQL blocks all incoming connections. You need to add your backend VM's public IP as an authorised network.

1. In Cloud SQL, click your instance → **Connections** tab → **Networking**
2. Under **Authorised networks**, click **Add network**
3. Enter your backend VM's public IP with `/32` at the end (e.g. `34.35.151.43/32`)
4. Name it `backend-vm` so you remember what it is
5. Click **Save**

> **Why /32?** CIDR notation — `/32` means exactly one IP address. `/0` would mean the entire internet, which you never want for a database.

### Step 4 — Note the Cloud SQL public IP

On the instance overview page, copy the **Public IP address** — you'll need this as `DB_HOST` in GitHub Secrets later. This is different from the instance ID (`todo-db`).

---

## Part 2: Create the Database and User

We connect to Cloud SQL directly from the **backend VM** — this is the most reliable method since the VM's IP is already whitelisted in the authorised networks list.

### Step 5 — SSH into the backend VM

Connect via VS Code Remote-SSH, then install the MySQL client:

```bash
sudo apt-get install -y default-mysql-client
```

### Step 6 — Connect to Cloud SQL

```bash
mysql --host=YOUR_CLOUD_SQL_PUBLIC_IP --user=root --password --skip-ssl
```

> `--skip-ssl` is required because the MySQL client installed on Ubuntu is MariaDB-based and doesn't support the SSL handshake that MySQL 8.4 expects. The connection still goes over the network securely via GCP's authorised networks restriction.

Enter your root password when prompted. You should see the `MySQL [(none)]>` prompt.

### Step 7 — Create the database

```sql
CREATE DATABASE tododb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```


### Step 8 — Create a dedicated app user



```sql
CREATE USER 'todo_user'@'%' IDENTIFIED BY 'your-strong-password-here';
GRANT SELECT, INSERT, UPDATE, DELETE ON tododb.* TO 'todo_user'@'%';
FLUSH PRIVILEGES;
```

> `'%'` means this user can connect from any host. The `GRANT` line gives only the four operations the app actually needs — it cannot drop tables, create users, or do anything destructive.

Verify the user and grants were created correctly:

```sql
SELECT user, host FROM mysql.user WHERE user = 'todo_user';
SHOW GRANTS FOR 'todo_user'@'%';
```

You should see two grant lines: `GRANT USAGE ON *.*` and `GRANT SELECT, INSERT, UPDATE, DELETE ON tododb.*`.

### Step 9 — Create the todos table

```sql
USE tododb;

CREATE TABLE todos (
  id          VARCHAR(36)  PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  completed   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```


Optionally seed some initial data:

```sql
INSERT INTO todos (id, title, completed) VALUES
  (UUID(), 'Buy groceries', 0),
  (UUID(), 'Read a book',   1);
```

Exit the MySQL shell:

```sql
EXIT;
```

---


```

---

## Part 4: Add GitHub Secrets

In your `todo-backend` GitHub repo, go to **Settings → Secrets and variables → Actions** and add these secrets:

| Secret | Value | Notes |
|---|---|---|
| `DB_HOST` | Cloud SQL public IP | From Step 4 — the IP address, not the instance name |
| `DB_PORT` | `3306` | MySQL default port |
| `DB_USER` | `todo_user` | The user created in Step 8 |
| `DB_PASSWORD` | Your chosen password | The one set in Step 8 |
| `DB_NAME` | `tododb` | The database name from Step 7 — **not** `todo-db` |
| `FRONTEND_URL` | `http://YOUR_FRONTEND_VM_IP` | For CORS on the backend |

> **Common mistake:** `DB_NAME` must be `tododb` (the MySQL database name you created), not `todo-db` (the GCP Cloud SQL instance ID). They look similar but are completely different things. Getting this wrong causes `Access denied` errors even when the password is correct.

From this point on, every push to `master` deploys the updated code with credentials injected automatically by the pipeline — no manual editing on the VM needed.

---

## Verify Everything Works

Hit the health check in your browser:

```
http://YOUR_BACKEND_VM_IP/health
```

You should see:

```json
{ "status": "ok", "database": "connected" }
```

If you see `"database": "unreachable"` with `Access denied`, the most likely causes in order:

1. `DB_NAME` GitHub Secret is `todo-db` instead of `tododb` — fix the secret and redeploy
2. `DB_HOST` is wrong — must be the Cloud SQL **public IP**, not the instance name
3. The backend VM's IP isn't in Cloud SQL's authorised networks list (Step 3)
4. Wrong `DB_USER` or `DB_PASSWORD`

Then test the API:

```
http://YOUR_BACKEND_VM_IP/api/todos
```

Add a new todo from the frontend, refresh the page — the todo should still be there. Unlike the in-memory version, data now persists across restarts and redeployments.

