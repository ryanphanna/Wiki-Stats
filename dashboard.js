(function () {
    'use strict';

    init();

    async function init() {
        const result = await chrome.storage.local.get(['articles', 'links', 'dailyStats']);
        const articles = result.articles || {};
        const dailyStats = result.dailyStats || {};

        // Backfill dailyStats from article timestamps for pre-existing data
        const mergedDailyStats = backfillDailyStats(articles, dailyStats);

        const articleList = Object.entries(articles).map(([url, data]) => ({
            url,
            ...data
        }));

        renderStatCards(articleList, mergedDailyStats);
        renderCalendar(mergedDailyStats);
        renderSparkline(mergedDailyStats);
        renderHistory(articleList);

        document.getElementById('export-btn').addEventListener('click', () => exportData(result));
        document.getElementById('clear-btn').addEventListener('click', clearData);
        document.getElementById('history-search').addEventListener('input', (e) => {
            renderHistory(articleList, e.target.value.toLowerCase());
        });
    }

    // ── Backfill ────────────────────────────

    function backfillDailyStats(articles, existing) {
        const stats = { ...existing };
        Object.values(articles).forEach(article => {
            const dateKey = new Date(article.timestamp).toISOString().split('T')[0];
            if (!stats[dateKey]) {
                stats[dateKey] = 0;
            }
            // Only backfill if this date isn't already tracked
            if (!existing[dateKey]) {
                stats[dateKey]++;
            }
        });
        return stats;
    }

    // ── Stat Cards ──────────────────────────

    function renderStatCards(articles, dailyStats) {
        const container = document.getElementById('stats-cards');
        const total = articles.length;

        // Current streak
        const streak = computeStreak(dailyStats);

        // Best day
        let bestDay = '—';
        let bestCount = 0;
        Object.entries(dailyStats).forEach(([date, count]) => {
            if (count > bestCount) {
                bestCount = count;
                bestDay = date;
            }
        });

        // This week
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        let thisWeek = 0;
        Object.entries(dailyStats).forEach(([date, count]) => {
            if (new Date(date + 'T12:00:00') >= weekStart) {
                thisWeek += count;
            }
        });

        const bestDayFormatted = bestCount > 0
            ? new Date(bestDay + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';

        container.innerHTML = `
      <div class="dash-stat-card">
        <span class="dash-stat-label">Articles Read</span>
        <span class="dash-stat-value">${total}</span>
        <span class="dash-stat-meta">lifetime</span>
      </div>
      <div class="dash-stat-card">
        <span class="dash-stat-label">Current Streak</span>
        <span class="dash-stat-value">${streak}</span>
        <span class="dash-stat-meta">${streak === 1 ? 'day' : 'days'}</span>
      </div>
      <div class="dash-stat-card">
        <span class="dash-stat-label">Best Day</span>
        <span class="dash-stat-value">${bestCount || '—'}</span>
        <span class="dash-stat-meta">${bestDayFormatted}</span>
      </div>
      <div class="dash-stat-card">
        <span class="dash-stat-label">This Week</span>
        <span class="dash-stat-value">${thisWeek}</span>
        <span class="dash-stat-meta">articles</span>
      </div>
    `;
    }

    function computeStreak(dailyStats) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let streak = 0;
        let checkDate = new Date(today);

        // If no reading today, start from yesterday
        const todayKey = toDateKey(checkDate);
        if (!dailyStats[todayKey]) {
            checkDate.setDate(checkDate.getDate() - 1);
        }

        while (true) {
            const key = toDateKey(checkDate);
            if (dailyStats[key] && dailyStats[key] > 0) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }

        return streak;
    }

    // ── Calendar Heatmap ────────────────────

    function renderCalendar(dailyStats) {
        const grid = document.getElementById('calendar-grid');
        const monthLabels = document.getElementById('calendar-month-labels');
        const dayLabels = document.getElementById('calendar-day-labels');
        const subtitle = document.getElementById('calendar-subtitle');

        const WEEKS = 26;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find the Sunday that starts our range
        const endDay = new Date(today);
        const startDay = new Date(today);
        startDay.setDate(today.getDate() - (WEEKS * 7) + (6 - today.getDay()));

        // Count total for subtitle
        let totalInRange = 0;
        const activeDays = new Set();

        // Day labels (Mon, Wed, Fri)
        const dayNames = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
        dayLabels.innerHTML = dayNames
            .map(name => `<span class="dash-calendar-day-label">${name}</span>`)
            .join('');

        // Build weekly columns
        let currentDate = new Date(startDay);
        // Align to Sunday
        currentDate.setDate(currentDate.getDate() - currentDate.getDay());

        const weeks = [];
        const monthPositions = [];
        let lastMonth = -1;

        while (currentDate <= endDay || weeks.length < WEEKS) {
            const week = [];
            for (let d = 0; d < 7; d++) {
                const dateKey = toDateKey(currentDate);
                const count = dailyStats[dateKey] || 0;
                const isFuture = currentDate > today;

                if (count > 0) {
                    totalInRange += count;
                    activeDays.add(dateKey);
                }

                // Track month labels
                if (currentDate.getMonth() !== lastMonth && d === 0) {
                    lastMonth = currentDate.getMonth();
                    monthPositions.push({
                        index: weeks.length,
                        name: currentDate.toLocaleDateString('en-US', { month: 'short' })
                    });
                }

                week.push({ dateKey, count, isFuture });
                currentDate.setDate(currentDate.getDate() + 1);
            }
            weeks.push(week);

            if (weeks.length >= WEEKS) break;
        }

        // Find max for scaling
        const maxCount = Math.max(1, ...Object.values(dailyStats).filter(v => v > 0));

        // Render month labels
        monthLabels.innerHTML = '';
        const cellWidth = 16; // 13px cell + 3px gap
        monthPositions.forEach(mp => {
            const span = document.createElement('span');
            span.className = 'dash-calendar-month';
            span.textContent = mp.name;
            span.style.position = 'absolute';
            span.style.left = (mp.index * cellWidth) + 'px';
            monthLabels.appendChild(span);
        });
        monthLabels.style.position = 'relative';
        monthLabels.style.minWidth = (weeks.length * cellWidth) + 'px';

        // Render grid
        grid.innerHTML = '';
        grid.style.minWidth = (weeks.length * cellWidth) + 'px';

        weeks.forEach(week => {
            const col = document.createElement('div');
            col.className = 'dash-calendar-col';

            week.forEach(day => {
                const cell = document.createElement('div');
                cell.className = 'dash-calendar-cell';

                if (day.isFuture) {
                    cell.style.opacity = '0.3';
                } else {
                    const level = getLevel(day.count, maxCount);
                    cell.setAttribute('data-level', level);
                }

                // Tooltip
                const tooltip = document.createElement('span');
                tooltip.className = 'dash-tooltip';
                const dateFormatted = new Date(day.dateKey + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric'
                });
                tooltip.textContent = day.count > 0
                    ? `${day.count} article${day.count !== 1 ? 's' : ''} on ${dateFormatted}`
                    : `No reading on ${dateFormatted}`;
                cell.appendChild(tooltip);

                col.appendChild(cell);
            });

            grid.appendChild(col);
        });

        // Scroll to the end (most recent)
        const scrollContainer = document.querySelector('.dash-calendar-scroll');
        requestAnimationFrame(() => {
            scrollContainer.scrollLeft = scrollContainer.scrollWidth;
        });

        // Subtitle
        subtitle.textContent = `${totalInRange} articles across ${activeDays.size} active days in the last ${WEEKS} weeks`;
    }

    function getLevel(count, max) {
        if (count === 0) return 0;
        const ratio = count / max;
        if (ratio <= 0.25) return 1;
        if (ratio <= 0.5) return 2;
        if (ratio <= 0.75) return 3;
        return 4;
    }

    // ── Sparkline ───────────────────────────

    function renderSparkline(dailyStats) {
        const container = document.getElementById('sparkline-container');
        const DAYS = 30;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const data = [];
        const labels = [];

        for (let i = DAYS - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = toDateKey(d);
            data.push(dailyStats[key] || 0);
            labels.push(d);
        }

        const max = Math.max(1, ...data);
        const width = 900;
        const height = 60;
        const padX = 2;
        const padY = 4;

        const points = data.map((val, i) => {
            const x = padX + (i / (data.length - 1)) * (width - padX * 2);
            const y = padY + (1 - val / max) * (height - padY * 2);
            return { x, y };
        });

        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        const fillPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;

        // Last point for the dot
        const last = points[points.length - 1];

        const firstLabel = labels[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const lastLabel = labels[labels.length - 1].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path class="sparkline-fill" d="${fillPath}"/>
        <path class="sparkline-line" d="${linePath}"/>
        <circle class="sparkline-dot" cx="${last.x}" cy="${last.y}" r="3"/>
      </svg>
      <div class="dash-sparkline-labels">
        <span class="dash-sparkline-label">${firstLabel}</span>
        <span class="dash-sparkline-label">${lastLabel}</span>
      </div>
    `;
    }

    // ── History ─────────────────────────────

    function renderHistory(articles, searchTerm) {
        const container = document.getElementById('history-list');

        let filtered = articles;
        if (searchTerm) {
            filtered = articles.filter(a =>
                a.title.toLowerCase().includes(searchTerm)
            );
        }

        filtered.sort((a, b) => (b.lastVisit || b.timestamp) - (a.lastVisit || a.timestamp));

        if (filtered.length === 0) {
            container.innerHTML = `
        <div class="dash-history-empty">
          <div class="dash-history-empty-icon">📖</div>
          ${searchTerm ? 'No articles match your search' : 'No articles read yet — go explore Wikipedia!'}
        </div>
      `;
            return;
        }

        container.innerHTML = filtered.map(article => {
            const timeAgo = getTimeAgo(article.lastVisit || article.timestamp);
            const visits = article.visitCount || 1;
            const initial = (article.title || '?')[0].toUpperCase();

            return `
        <div class="dash-history-item">
          <div class="dash-history-icon">${escapeHtml(initial)}</div>
          <div class="dash-history-info">
            <a class="dash-history-title" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">
              ${escapeHtml(article.title)}
            </a>
            <div class="dash-history-meta">${timeAgo}${article.linkCount ? ' · ' + article.linkCount + ' links' : ''}</div>
          </div>
          <span class="dash-history-visits">${visits}×</span>
        </div>
      `;
        }).join('');
    }

    // ── Export ──────────────────────────────

    function exportData(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wiki-stats-export-${toDateKey(new Date())}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function clearData() {
        if (confirm('Clear all your Wikipedia reading data? This cannot be undone.')) {
            chrome.storage.local.remove(['articles', 'links', 'dailyStats']).then(() => {
                location.reload();
            });
        }
    }

    // ── Helpers ─────────────────────────────

    function toDateKey(date) {
        return date.toISOString().split('T')[0];
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
        if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
        return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
})();
