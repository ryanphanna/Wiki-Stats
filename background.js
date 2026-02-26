chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveArticle') {
    saveArticleData(request.data).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'getStats') {
    getArticleStats(request.url).then(stats => {
      sendResponse(stats);
    });
    return true;
  }
});

async function saveArticleData(data) {
  const { url, title, links, timestamp } = data;

  try {
    const result = await chrome.storage.local.get(['articles', 'links', 'dailyStats']);
    const articles = result.articles || {};
    const allLinks = result.links || {};
    const dailyStats = result.dailyStats || {};

    const dateKey = new Date(timestamp).toISOString().split('T')[0];

    if (articles[url]) {
      articles[url].visitCount = (articles[url].visitCount || 1) + 1;
      articles[url].lastVisit = timestamp;
      articles[url].linkCount = links.length;
    } else {
      articles[url] = {
        title: title,
        timestamp: timestamp,
        lastVisit: timestamp,
        visitCount: 1,
        linkCount: links.length
      };
    }

    dailyStats[dateKey] = (dailyStats[dateKey] || 0) + 1;

    allLinks[url] = links;

    await chrome.storage.local.set({
      articles: articles,
      links: allLinks,
      dailyStats: dailyStats
    });

    console.log('Saved article:', title, 'with', links.length, 'links');
  } catch (error) {
    console.error('Error saving article:', error);
  }
}

async function getArticleStats(url) {
  try {
    const result = await chrome.storage.local.get(['articles', 'links']);
    const articles = result.articles || {};
    const allLinks = result.links || {};

    const articleLinks = allLinks[url] || [];
    const readLinks = articleLinks.filter(linkUrl => articles[linkUrl]);
    const percentage = articleLinks.length > 0
      ? Math.round((readLinks.length / articleLinks.length) * 100)
      : 0;

    return {
      totalLinks: articleLinks.length,
      readLinks: readLinks.length,
      percentage: percentage,
      unreadLinks: articleLinks.filter(linkUrl => !articles[linkUrl])
    };
  } catch (error) {
    console.error('Error getting stats:', error);
    return {
      totalLinks: 0,
      readLinks: 0,
      percentage: 0,
      unreadLinks: []
    };
  }
}
