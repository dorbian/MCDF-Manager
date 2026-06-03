# MCDF Manager

MCDF Manager is a desktop app for keeping, reviewing, and sharing MCDF character packages. It gives players a local character library, a registry browser, and a controlled publishing flow for community sharing.

## Features

- Keep a local library of MCDF files.
- Add MCDFs from disk, Google Drive links, or direct HTTPS links.
- Review package details before adding an entry to your library.
- Add a display name, description, tags, 18+ marker, and preview image for your own library entries.
- Browse The Eorzea Exchange through the public registry index.
- Download public entries without registering.
- Register a profile for publishing, access requests, reports, profile sync, and community services.
- Publish entries when connected with an authorized profile.

## Local-first design

Browsing, downloading, and local library management do not require an account. MCDF Manager stores library state locally first. Registration is required for shared and community features such as publishing, access requests, reports, profile sync, and administration.

Updates replace application files only. User settings, profiles, auth packages, subscriptions, cache, and local library data stay in the app data folder.

## Building from source

Requirements:

- Node.js 22+
- pnpm 9+
- Rust stable
- Tauri prerequisites for your operating system

Install dependencies:

```powershell
pnpm install --no-frozen-lockfile
```

Run the desktop app in development mode:

```powershell
pnpm tauri dev
```

Build a desktop release:

```powershell
pnpm tauri build
```

## Release builds

GitHub Actions builds client releases from this repository. Release artifacts are published as GitHub Release assets for Windows, macOS, and Linux.

## Privacy and safety

MCDF Manager does not expose raw storage locations for uploaded preview images, file parts, private administrative state, or internal blob locations in user-facing views. Public browsing uses the public registry index.
