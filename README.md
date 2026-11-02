# Daywell

A quiet, minimal calendar journal. Every date opens into a page where you can write freely.

## Features

- Monthly calendar with Monday-first weeks and previews for written dates
- A dedicated long-form journal page for every date
- Debounced autosave and previous/next-day navigation
- Local-first storage using IndexedDB, with a localStorage fallback
- JSON backup and restore for keeping a separate copy of your entries
- Installable Progressive Web App with an offline app shell
- Responsive layout for phones, tablets, and desktops
- No account, server, analytics, or cloud sync required

## Project structure

```text
Daywell/
├── index.html
├── css/
│   └── styles.css
├── js/
│   └── app.js
├── manifest.json
├── sw.js
└── icon.svg
```

The app uses vanilla HTML, CSS, and JavaScript. There is no build step or third-party runtime dependency. The application code is separated by responsibility: the HTML provides the page structure, the stylesheet controls presentation, and the JavaScript handles the calendar, editor, storage, backup, and PWA install flow.

## Run locally

Serve the repository over HTTP rather than opening `index.html` as a file URL. For example, with Python installed, run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Install on a phone

Deploy over HTTPS, open the site in the phone's browser, and choose Install app or Add to Home Screen from the browser menu. The service worker caches the app shell for offline use. Journal entries are stored locally in that browser's IndexedDB database and do not leave the device.

## Important storage note

Entries are stored per browser profile and device. They are not automatically synced between a phone and a laptop. Clearing browser/site data, uninstalling the app, or losing the device may remove local entries. Use the Backup action regularly and keep the exported JSON file somewhere safe.

## Deploy with GitHub Pages

The repository includes a GitHub Actions workflow for deploying the root of the default branch to GitHub Pages. In repository Settings, set Pages → Build and deployment → Source to GitHub Actions. The app uses relative asset paths so it can run from a repository subpath.

## Stack

Vanilla HTML, CSS, and JavaScript; IndexedDB; service worker; Web App Manifest. No build step or third-party runtime dependencies.
