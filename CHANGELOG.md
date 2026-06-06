# Changelog


## fix122-policy-admin-ux

### Changed
- Removed the admin-only Check sharing policy action from the normal Library toolbar so uploading does not look blocked by a manual moderation step.
- Added automatic admin-token preflight before publishing when moderation access is configured; publishing still relies on the registry to enforce blocked hashes.
- Added a selected-entry Refresh moderation status action for admins so the exact blocked package or file hash can be refreshed from the detail panel.
- Clarified that moderation blocks are managed in Admin under the Moderation blocklist, not from normal library entries.

### Fixed
- Fixed a duplicated Library list row wrapper left by the previous action-cluster layout pass.


## fix121-compile-fix-selective-upload

### Fixed
- Fixed the Windows Tauri build error caused by the RAM-slice selective upload parser adding `decoded_bytes` to `ParsedMCDFPackage` while one exact-rebuild synthetic package initializer still omitted it.
- Exchange downloads and exact rebuild metadata now compile with the RAM-backed package model.

## fix120-ram-slice-selective-upload

### Changed
- MCDF parsing now keeps one decoded package buffer and records internal file offsets instead of cloning every internal payload during analysis.
- Upload publishing now probes the registry with the hash manifest first, then sends only the missing internal file slices requested by the server.
- Analyze MCDF, file inventory inspection, and scan commands now use the same package parse result so metadata and internal hashes are produced from one parsed package view.

### Fixed
- Reduced large MCDF memory churn during analysis and publishing by avoiding one Vec copy per internal texture, model, material, or skeleton file.
- Publishing notes now describe skipped known files and uploaded missing slices so the user understands that the client is not re-uploading already-known registry layers.

## fix119-analyze-import-registry-status

### Added
- Analyze MCDF now keeps the action bar visible before and after selecting a file.
- Added Import to library directly from Analyze MCDF so a locally inspected bundle can be added to MCDF Manager without opening the Add MCDF flow.
- Internal file inventory rows now show whether each file hash is not checked, known in the registry, missing in the registry, or unknown.
- Added a combined native analyze command that opens the MCDF once and returns metadata plus internal file hashes together.

### Changed
- Analyze MCDF no longer shows the large empty upload panel before a file is selected.
- Component groups show registry status only after the registry hash check runs. Before that they show registry not checked instead of 0 known / 0 missing.
- Metadata display now hides missing sections and only shows found metadata badges, with a cleaner empty-description message.
- Large-file progress text explains that opening and hashing can be slow because the app reads archive metadata and internal entries safely.

### Fixed
- Removed the misleading Availability known progress card after a registry hash check completes.
- Removed misleading zero known / zero missing counts before the registry check runs.

## fix118-direct-analyze-and-release-polish

### Added
- Analyze MCDF now opens the file picker directly from the navigation item.
- The Analyze MCDF page shows results first, with only a compact action bar after a file is selected.
- GitHub Releases now publish clean MCDF Manager platform assets, checksums, and a release manifest.
- Client CI now validates the public client build and checks public product text for private/internal wording.
- Added a GitHub bug report template so found bugs have consistent reproduction, version, platform, and log fields.

### Changed
- Removed the large pre-analysis panels from Analyze MCDF.
- Release notes are generated from the top CHANGELOG entry and uploaded to the GitHub Release page.
- Release artifacts now use official names such as `MCDF-Manager-Windows-x86_64-v0.1.0.zip` instead of attempt-numbered CI artifacts.

### Fixed
- Analyze MCDF no longer requires an extra button click after opening the page from the sidebar.
- Release assets no longer expose `attempt.1` naming on the public release page.

## fix117-library-disallowed-and-analyzer-layout

- Changed the Library sharing state so blocked entries show a strong Disallowed label instead of showing Allowed as the main status.
- Removed Review needed from normal library sharing classifications; moderation review remains an admin workflow concept, not a library state.
- Reduced repeated local/on-device wording in library cards, pills, and filters.
- Simplified Library list view columns by removing duplicate Source/Status columns and keeping Exchange, Sharing, and Blocking file visible.
- Reflowed Analyze MCDF into a single-width layout with the internal file inventory below the summary panels to avoid horizontal scrolling.
- Made long MCDF paths and hashes wrap/tooltip safely in analyzer and policy panels.

## fix116-library-action-cluster

- Added grouped library entry actions for Share, Export/Download, Publish, and Remove.
- Added a public Exchange share action that copies a share reference for entries already listed publicly.
- Added Export MCDF for local library entries so users can save the MCDF back out of the library.
- Reused the Download MCDF flow for subscribed Exchange entries from the same action cluster.
- Kept blocked entries visible but disabled publishing when the sharing policy blocks upload.

## fix115-library-sharing-policy-classification

- Added stored file-hash manifests for local MCDF library entries.
- Added sharing policy classification fields for allowed, restricted, blocked by policy, review needed, and potentially illegal moderation matches.
- Added a Library list-view Sharing column and Reason file column so blocked uploads show the exact package or file hash reason.
- Added a Check sharing policy action that matches stored package/file BLAKE3 hashes against the moderation blocklist without uploading MCDF bytes.
- Publishing is blocked locally when a library entry has a blocked moderation classification.
- Added a potentially illegal category to the admin moderation block form.

## fix114-local-analyze-hash-manifest

- Analyze MCDF now parses local metadata and internal files without contacting the registry server.
- Added a separate Check online hashes action that sends only the collected BLAKE3 hash manifest to the archive server.
- Server availability check failures keep the local analysis visible instead of failing the Analyze MCDF flow.
- Added a Tauri command for the hash manifest probe so the desktop client uses the same native network path as archive operations.

## fix113-project-page-changelog

- Added a public project README for the MCDF Manager client repository.
- Added this changelog for release history.
- Updated the release workflow to build tagged client releases.
- Kept local library behavior explicit: local metadata changes stay local until publishing.
- Documented the difference between local availability and Exchange visibility.

## fix112-local-preview-status

- Local preview image changes persist and render correctly.
- Local entries show `local` status.
- Exchange visibility is shown separately as public listing state.
