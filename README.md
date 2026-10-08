# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the backend API server in a separate terminal.
npm run dev:backend

# Step 5: Start the frontend dev server.
npm run dev
```

> Note: The frontend expects the backend API to be available at `http://127.0.0.1:3001` during local development. If that backend is not running, login and data requests will fail with `ERR_CONNECTION_REFUSED`.

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Marketplace orders (Uber Eats, Deliveroo, Just Eat)

Backend details: `backend/README.md`. Partner checklists: `docs/integrations/deliveroo.md`, `docs/integrations/justeat.md`.

**Security:** `JWT_SECRET` should be rotated if JWTs were ever logged. Uber / Deliveroo / Just Eat secrets must only live in `backend/.env` (never commit them).

PowerShell (from the repo root):

```powershell
$env:UBER_CLIENT_SECRET = "..."
npm run uber:check --prefix backend
npm run fetch-orders --prefix backend
```

Local webhooks:

```powershell
ngrok http 3033
```

Dashboard URLs:

- Uber: `https://<host>/webhooks/uber`
- Deliveroo: `https://<host>/webhooks/deliveroo`
- Just Eat: `https://<host>/webhooks/justeat`

Sandbox vs production: set `UBER_ENV=sandbox` or `production` (token URL and API base are paired in code). Same idea for `DELIVEROO_ENV` / `JUSTEAT_ENV` once those partners are enabled.
