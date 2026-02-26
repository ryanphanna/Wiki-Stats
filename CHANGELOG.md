# Changelog

All notable changes to Wiki Stats will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Full-page dashboard accessible by clicking the extension icon or from the sidebar
- GitHub-style reading calendar heatmap showing 26 weeks of activity
- 30-day sparkline chart of daily reading activity
- Stat cards for articles read, current streak, best day, and weekly count
- Searchable reading history with visit counts and link stats
- Daily stats tracking (`dailyStats` storage key) for calendar and sparkline data
- JSON data export button on the dashboard
- "📊 Dashboard" link in the sidebar footer
- Tooltip on extension icon ("Open Wiki Stats Dashboard")
- Automatic backfilling of daily stats from existing article timestamps

### Changed

- Version bumped to 1.1.0
- "Clear Data" now removes only `articles`, `links`, and `dailyStats` keys instead of wiping all extension storage

### Fixed

- `chrome.storage.local.clear()` replaced with `chrome.storage.local.remove()` to avoid destroying unrelated storage keys

## [1.0.0] - 2025-02-22

### Added

- Initial release
- Reading progress tracking with 15-second minimum read time
- Smart sidebar with real-time stats on Wikipedia article pages
- Progress bar showing percentage of outbound links read
- "Explore next" section with unread links from the current page
- "Referenced in" section showing which previously-read articles link to the current page
- "Suggested" section surfacing frequently-linked unread articles from across the reading network
- Visit count tracking per article
- Active time tracking with visibility and focus detection
- Link extraction with namespace filtering
- Privacy-first local-only storage via Chrome Storage API
