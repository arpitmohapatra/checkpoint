# Checkpoint

Plant a flag for every bit of progress, and keep every word of client feedback.

Checkpoint is a small, local-first PWA for freelancers and small studios. Everything is stored in your browser on this device. There is no account and no server.

**Live:** https://arpitmohapatra.github.io/checkpoint/

## What's inside

- **Overview:** a card for each project, showing its latest checkpoint, its latest feedback or how long you've been waiting to hear back, and a 20-week momentum strip.
- **Quick capture:** type straight into the overview or into the command palette (<kbd>⌘K</kbd> / <kbd>Ctrl K</kbd>):
  - `acme: shipped the homepage` logs a checkpoint on the project matching "acme". It matches the project's shortcut, its name or its client.
  - `fb acme: love the new colors` logs feedback from the project's contact. Praise and change requests are detected for you.
  - `… @yesterday`, `@mon`, `@3d`, `@sep 20` or `@2026-09-20` set the date.
- **Project trail:** a map of every flag you planted and every note you heard, plus a log you can filter, the mood of the room, and "Copy update" for pasting to a client.
- **Timeline ledger:** every entry, newest first, with search and a client filter.
- **Feedback wall:** every piece of feedback, filtered by praise, changes or notes.
- **Weekly recap:** a story-style summary of your week that you can copy and share.
- **Offline and installable:** a service worker caches the app, and it can be installed on desktop and mobile.
- **Backup:** export and import JSON from Settings.

Keyboard: <kbd>L</kbd>/<kbd>P</kbd> log · <kbd>F</kbd> feedback · <kbd>R</kbd> recap · <kbd>D</kbd> dark mode · <kbd>⇧N</kbd> new project · <kbd>/</kbd> palette.

## Develop

There is no build step. Serve the folder with any static server:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

`.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to `main` or to the working branch. In the repository settings, **Pages → Build and deployment → Source** must be set to **GitHub Actions**.
