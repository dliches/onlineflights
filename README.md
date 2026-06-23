# Family Flight Tracker - GitHub Pages + Supabase

This is the simple static GitHub Pages version connected to Supabase.

## What it does

- Runs from GitHub Pages using `index.html`, `styles.css`, `app.js` and `config.js`.
- Stores flights online in Supabase table `flights`.
- Keeps separate travellers: Daniel, Lidia, David and Alvaro.
- Imports Daniel's 448 starting flights from `data/daniel.json` into Supabase.
- Calculates distance and estimated duration for new flights using `data/airports.json`.
- Includes Flightdata, Statistics, Route map and Visited countries tabs.

## First setup

1. Open Supabase.
2. Open your project.
3. Go to SQL Editor.
4. Open `sql/supabase-setup.sql` from this project.
5. Copy the full SQL into Supabase and click Run.
6. Create a new GitHub repository.
7. Upload the extracted contents of this folder to the repository root.
8. Enable GitHub Pages from the `main` branch and `/ (root)` folder.
9. Open the live GitHub Pages website.
10. Go to the Setup tab and click `Import Daniel's 448 flights` once.

After that, add/edit/delete actions save directly to Supabase.

## Important security note

This simple version allows public anonymous read/write access to the `flights` table so that it works without login on GitHub Pages. Anyone who discovers your website URL could change the data. For private/protected use, add Supabase Auth or move the write actions to a serverless backend such as Vercel/Netlify functions.
