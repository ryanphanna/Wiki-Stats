(function() {
  'use strict';

  if (!isArticlePage()) {
    return;
  }

  const articleUrl = normalizeUrl(window.location.href);
  const articleTitle = getArticleTitle();

  console.log('Wikipedia Progress Tracker: Loaded on', articleTitle);

  const links = extractWikipediaLinks();

  console.log('Found', links.length, 'links on this page');

  let activeTime = 0;
  let lastActiveStart = Date.now();
  let isTabActive = !document.hidden;
  let hasBeenCounted = false;
  const MIN_READ_TIME = 15000;

  function updateActiveTime() {
    if (isTabActive) {
      activeTime += Date.now() - lastActiveStart;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      updateActiveTime();
      isTabActive = false;
    } else {
      isTabActive = true;
      lastActiveStart = Date.now();
    }
  });

  window.addEventListener('blur', () => {
    updateActiveTime();
    isTabActive = false;
  });

  window.addEventListener('focus', () => {
    if (!document.hidden) {
      isTabActive = true;
      lastActiveStart = Date.now();
    }
  });

  function shouldSave() {
    updateActiveTime();
    return activeTime >= MIN_READ_TIME && !hasBeenCounted;
  }

  function saveIfReady() {
    if (shouldSave()) {
      saveArticle(articleUrl, articleTitle, links);
      hasBeenCounted = true;
      return true;
    }
    return false;
  }

  const checkInterval = setInterval(() => {
    if (saveIfReady()) {
      clearInterval(checkInterval);
    }
  }, 1000);

  window.addEventListener('beforeunload', () => {
    clearInterval(checkInterval);
    saveIfReady();
  });

  window.addEventListener('pagehide', () => {
    clearInterval(checkInterval);
    saveIfReady();
  });

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="/wiki/"]');
    if (link && shouldSave()) {
      saveArticle(articleUrl, articleTitle, links);
      hasBeenCounted = true;
      clearInterval(checkInterval);
    }
  }, true);

  displaySidebar(articleUrl, links);

  function isArticlePage() {
    const path = window.location.pathname;
    return path.includes('/wiki/') &&
           !path.includes('Special:') &&
           !path.includes('Talk:') &&
           !path.includes('Help:') &&
           !path.includes('Wikipedia:') &&
           !path.includes('File:') &&
           !path.includes('Category:');
  }

  function normalizeUrl(url) {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  }

  function getArticleTitle() {
    const titleElement = document.querySelector('#firstHeading');
    return titleElement ? titleElement.textContent.trim() : 'Unknown';
  }

  function extractWikipediaLinks() {
    const content = document.querySelector('#mw-content-text');
    if (!content) return [];

    const links = [];
    const linkElements = content.querySelectorAll('a[href^="/wiki/"]:not(.new)');

    const excludedNamespaces = [
      'Special:', 'Talk:', 'User:', 'User_talk:', 'Wikipedia:', 'Wikipedia_talk:',
      'File:', 'File_talk:', 'MediaWiki:', 'MediaWiki_talk:', 'Template:', 'Template_talk:',
      'Help:', 'Help_talk:', 'Category:', 'Category_talk:', 'Portal:', 'Portal_talk:',
      'Draft:', 'Draft_talk:', 'TimedText:', 'TimedText_talk:', 'Module:', 'Module_talk:'
    ];

    linkElements.forEach(link => {
      const href = link.getAttribute('href');

      if (!href || !href.startsWith('/wiki/')) return;

      const isNamespacePage = excludedNamespaces.some(ns =>
        href.startsWith('/wiki/' + ns)
      );

      if (!isNamespacePage && !href.includes('#')) {
        const fullUrl = normalizeUrl(window.location.origin + href);
        const title = link.textContent.trim();

        if (title && !links.find(l => l.url === fullUrl)) {
          links.push({
            url: fullUrl,
            title: title
          });
        }
      }
    });

    console.log('Extracted', links.length, 'links from page');
    return links;
  }

  function saveArticle(url, title, links) {
    try {
      chrome.runtime.sendMessage({
        action: 'saveArticle',
        data: {
          url: url,
          title: title,
          links: links.map(l => l.url),
          timestamp: Date.now()
        }
      });
    } catch (error) {
      console.log('Save attempt failed, will retry');
    }
  }

  function displaySidebar(url, allLinksOnPage) {
    chrome.runtime.sendMessage({
      action: 'getStats',
      url: url
    }, (stats) => {
      if (stats) {
        chrome.storage.local.get(['articles', 'links'], (result) => {
          const articles = result.articles || {};
          const allLinks = result.links || {};

          const unreadLinks = allLinksOnPage
            .filter(link => !articles[link.url])
            .slice(0, 3);

          const incomingLinks = [];
          Object.entries(allLinks).forEach(([articleUrl, links]) => {
            if (articles[articleUrl] && links.includes(url)) {
              incomingLinks.push({
                url: articleUrl,
                title: articles[articleUrl].title,
                timestamp: articles[articleUrl].lastVisit || articles[articleUrl].timestamp
              });
            }
          });

          incomingLinks.sort((a, b) => b.timestamp - a.timestamp);

          const linkCounts = {};
          Object.entries(allLinks).forEach(([articleUrl, links]) => {
            if (articles[articleUrl]) {
              links.forEach(link => {
                if (!articles[link]) {
                  linkCounts[link] = (linkCounts[link] || 0) + 1;
                }
              });
            }
          });

          const suggestedFromNetwork = Object.entries(linkCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([linkUrl, count]) => ({
              url: linkUrl,
              title: getTitleFromUrl(linkUrl),
              count: count
            }));

          const articleData = articles[url];
          const visitCount = articleData ? (articleData.visitCount || 1) : 1;

          createSidebar(stats, visitCount, unreadLinks, incomingLinks, suggestedFromNetwork);
        });
      }
    });
  }

  function createSidebar(stats, visitCount, unreadLinks, incomingLinks, suggestedFromNetwork) {
    const sidebar = document.createElement('div');
    sidebar.id = 'wiki-progress-sidebar';
    sidebar.className = 'wiki-sidebar-visible';

    const visitInfo = visitCount > 1 ? `<div class="wiki-sidebar-visit">Visit #${visitCount}</div>` : '';

    let contextTrailHTML = '';
    if (incomingLinks.length > 0) {
      const linksList = incomingLinks.slice(0, 5).map(link => {
        const timeAgo = getTimeAgo(link.timestamp);
        return `<li><a href="${link.url}" class="wiki-sidebar-context-link">${link.title}</a> <span class="wiki-sidebar-time">${timeAgo}</span></li>`;
      }).join('');

      contextTrailHTML = `
        <div class="wiki-sidebar-section">
          <div class="wiki-sidebar-section-title">← Referenced in:</div>
          <ul class="wiki-sidebar-context-list">
            ${linksList}
          </ul>
        </div>
      `;
    }

    let unreadLinksHTML = '';
    if (unreadLinks.length > 0) {
      unreadLinksHTML = unreadLinks.map(link =>
        `<li><a href="${link.url}" class="wiki-sidebar-link">${link.title}</a></li>`
      ).join('');
    } else {
      unreadLinksHTML = '<li class="wiki-sidebar-empty">All links read! 🎉</li>';
    }

    let suggestedHTML = '';
    if (suggestedFromNetwork.length > 0) {
      const suggestionsList = suggestedFromNetwork.map(article =>
        `<li><a href="${article.url}" class="wiki-sidebar-link">${article.title}</a> <span class="wiki-sidebar-ref-count">(${article.count}×)</span></li>`
      ).join('');

      suggestedHTML = `
        <div class="wiki-sidebar-section">
          <div class="wiki-sidebar-section-title">💡 Suggested:</div>
          <nav class="wiki-sidebar-nav">
            <ul>
              ${suggestionsList}
            </ul>
          </nav>
        </div>
      `;
    }

    sidebar.innerHTML = `
      <div class="wiki-sidebar-header">
        <h3 class="wiki-sidebar-title">Reading Progress</h3>
        <button class="wiki-sidebar-toggle" aria-label="hide">hide</button>
      </div>
      ${visitInfo}
      <div class="wiki-sidebar-progress">
        <div class="wiki-sidebar-progress-bar" style="width: ${stats.percentage}%"></div>
      </div>
      <div class="wiki-sidebar-text">${stats.readLinks} of ${stats.totalLinks} links read (${stats.percentage}%)</div>
      ${contextTrailHTML}
      <div class="wiki-sidebar-section">
        <div class="wiki-sidebar-section-title">Explore next:</div>
        <nav class="wiki-sidebar-nav">
          <ul>
            ${unreadLinksHTML}
          </ul>
        </nav>
      </div>
      ${suggestedHTML}
      <div class="wiki-sidebar-footer">
        <button class="wiki-sidebar-clear" title="Clear all reading data">Clear Data</button>
      </div>
    `;

    document.body.appendChild(sidebar);

    const toggleBtn = sidebar.querySelector('.wiki-sidebar-toggle');
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('wiki-sidebar-collapsed');
      toggleBtn.textContent = sidebar.classList.contains('wiki-sidebar-collapsed') ? 'show' : 'hide';
    });

    const clearBtn = sidebar.querySelector('.wiki-sidebar-clear');
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all your Wikipedia reading data? This cannot be undone.')) {
        chrome.storage.local.clear().then(() => {
          location.reload();
        });
      }
    });
  }

  function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';

    return new Date(timestamp).toLocaleDateString();
  }

  function getTitleFromUrl(url) {
    const match = url.match(/\/wiki\/([^?#]+)/);
    if (match) {
      return decodeURIComponent(match[1]).replace(/_/g, ' ');
    }
    return 'Unknown Article';
  }
})();
