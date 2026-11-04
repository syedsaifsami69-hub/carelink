# Deploying CareLink to the Live Web

CareLink is a full-stack application with a React frontend (Vite) and a Node.js Express server + WebSockets backend.

Because it uses WebSockets for real-time synchronization, it is best deployed to a host that supports persistent connections, such as **Render** or **Railway**. (Serverless hosts like Vercel or Netlify are not recommended).

Follow this step-by-step guide to get CareLink live on the public internet.

---

## Step 1: Initialize Git and Commit Your Code

Before deploying, your project needs to be tracked by Git. Run these commands in your project directory:

```bash
# Initialize a new git repository
git init

# Add all files to the staging area
git add .

# Create the initial commit
git commit -m "Configure CareLink for live deployment"
```

---

## Step 2: Push to GitHub

1. Go to [GitHub](https://github.com/) and create a new repository (it can be Public or Private). Do **not** initialize it with a README, `.gitignore`, or License.
2. Copy the repository URL (e.g., `https://github.com/your-username/carelink.git`).
3. Run the following commands to link and push your code:

```bash
# Link your local repository to GitHub (replace with your actual URL)
git remote add origin https://github.com/your-username/carelink.git

# Rename default branch to main
git branch -M main

# Push code to GitHub
git push -u origin main
```

---

## Step 3: Deploy to Render (Recommended & Free)

Render makes deployment easy using the included `render.yaml` Blueprint file.

1. Create a free account at [Render.com](https://render.com).
2. From the Render Dashboard, click **New +** (top right) and select **Blueprint**.
3. Link your GitHub account and select your `carelink` repository.
4. Render will read the `render.yaml` configuration file and automatically set up:
   - **Web service** `carelink`: build `npm install && npm run build && npx prisma migrate deploy`, start `node server/index.js`, health check `/api/health`
   - **Postgres database** `carelink-db`, wired in as `DATABASE_URL`
   - **Persistent disk** mounted at `/var/data` for uploaded lab files (`STORAGE_DIR=/var/data/storage`). Disks need a paid instance; without one, uploads are lost on every deploy.
   - `NODE_ENV=production`, which makes cookies `Secure` and blocks the demo seed
5. Do **not** run `npm run db:seed` in production. Create the first hospital and staff accounts with a one-off script or `npx prisma studio` until an admin onboarding screen exists.
6. Click **Apply** to start the build and deployment.
7. Once the build finishes, Render will provide a public URL (e.g., `https://carelink.onrender.com`).

---

## Step 4: Deploy to Railway (Alternative)

Railway is another excellent choice with fast build times and direct GitHub integration.

1. Sign up/log in to [Railway.app](https://railway.app).
2. Click **New Project** and select **Deploy from GitHub repo**.
3. Select your `carelink` repository.
4. Add a **PostgreSQL** plugin and set `DATABASE_URL` from it, plus `NODE_ENV=production`. Set the build command to `npm install && npm run build && npx prisma migrate deploy` and the start command to `node server/index.js`. Attach a volume and point `STORAGE_DIR` at it for uploads.
5. Once deployed, go to the **Settings** tab of the service, locate the **Networking** section, and click **Generate Domain** to get a public URL.

---

## How It Works Under the Hood

- **Frontend & Backend on the Same Port**: In production, the React frontend is compiled into static files (`dist/`) and served directly by the Express server on the same port.
- **Dynamic Protocols**: The frontend uses `location.protocol` to dynamically switch between `ws://` and `wss://` based on whether the page is loaded over HTTP or HTTPS. This ensures secure WebSockets work seamlessly on live domains without hardcoded URLs.
