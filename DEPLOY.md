# Deploying Movie Picker

The app is one Node server that serves both the API and the web app, so you deploy a
single service. It stores users, swipes, matches and ratings in a SQLite file, so it
**needs a persistent disk mounted at `/data`** — without one, everything is wiped on
every restart or redeploy.

Environment variables:

| Variable | Value |
|---|---|
| `TMDB_READ_TOKEN` | your TMDB API Read Access Token (the long `eyJ…` one) — keep it secret |
| `COOKIE_SECURE` | `true` (the host serves HTTPS) |
| `DB_FILE` | `/data/movie-picker.db` (already the default in the Dockerfile) |
| `TMDB_LANGUAGE` | optional, e.g. `da-DK` for Danish titles |

## Option A: Railway (all in the browser)

1. Sign in at https://railway.com with GitHub.
2. **New Project → Deploy from GitHub repo →** pick `movie-picker`. Railway finds the
   `Dockerfile` and builds it.
3. Open the service → **Variables** → add `TMDB_READ_TOKEN` and `COOKIE_SECURE=true`.
4. Right-click the service → **Attach volume** → mount path `/data`.
5. **Settings → Networking → Generate Domain**. That URL is your app.

Every push to `main` redeploys automatically.

## Option B: Fly.io (command line)

Install the CLI (https://fly.io/docs/flyctl/install/), then from the project folder:

```bash
fly auth login
fly launch --copy-config --no-deploy        # pick a unique app name when asked
fly volumes create movie_picker_data --region arn --size 1
fly secrets set TMDB_READ_TOKEN=eyJ...your token...
fly deploy
```

Your app is at `https://<app-name>.fly.dev`. Run `fly deploy` again after changes.
The machine sleeps when unused and wakes on the next visit (first load takes a few seconds).

## After deploying

1. Open the URL, sign up, and create a party.
2. Tap **Invite** and send her the link — she signs up from the link and lands in your party.
3. Both of you can add the site to your phone's home screen for an app-like feel.

Note: anyone who has the URL can create an account, but they can only see parties
they've been invited to.
