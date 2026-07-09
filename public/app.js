(() => {
  'use strict';

  const TOKEN_KEY = 'slack_access_token';
  const REMEMBER_KEY = 'slack_remember';
  const FAVORITES_KEY = 'slack_favorite_users';

  const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
  const SLACK_API_BASE = 'https://slack.com/api';

  const state = {
    config: null,
    token: null,
    users: [],           // { id, name, image }
    favoriteIds: new Set(),
    selectedUserIds: new Set(),
    posts: [],            // { userId, userName, text, ts, permalink }
    sort: { key: 'date', asc: false },
  };

  const el = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindEvents();
    registerServiceWorker();

    state.favoriteIds = new Set(loadFavoritesFromStorage());

    try {
      state.config = await fetchJson('/api/config');
    } catch (e) {
      showLoginError('サーバー設定の取得に失敗しました。');
      return;
    }

    const code = getQueryParam('code');
    if (code) {
      await handleOAuthCallback(code);
      return;
    }

    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      state.token = savedToken;
      await enterConditionScreen();
      return;
    }

    showScreen('login');
  }

  function cacheElements() {
    el.screens = {
      login: document.getElementById('screen-login'),
      favorites: document.getElementById('screen-favorites'),
      condition: document.getElementById('screen-condition'),
      loading: document.getElementById('screen-loading'),
      list: document.getElementById('screen-list'),
    };
    el.btnSlackLogin = document.getElementById('btn-slack-login');
    el.chkRemember = document.getElementById('chk-remember');
    el.loginError = document.getElementById('login-error');

    el.btnFavoritesBack = document.getElementById('btn-favorites-back');
    el.favoritesFilter = document.getElementById('favorites-filter');
    el.favoritesManageList = document.getElementById('favorites-manage-list');

    el.btnManageFavorites = document.getElementById('btn-manage-favorites');
    el.btnLogout = document.getElementById('btn-logout');
    el.userFilter = document.getElementById('user-filter');
    el.userList = document.getElementById('user-list');
    el.favoritesEmptyHint = document.getElementById('favorites-empty-hint');
    el.btnGotoFavorites = document.getElementById('btn-goto-favorites');
    el.dateFrom = document.getElementById('date-from');
    el.dateTo = document.getElementById('date-to');
    el.btnFetch = document.getElementById('btn-fetch');
    el.conditionError = document.getElementById('condition-error');

    el.loadingMessage = document.getElementById('loading-message');

    el.btnBack = document.getElementById('btn-back');
    el.resultCount = document.getElementById('result-count');
    el.sortButtons = Array.from(document.querySelectorAll('.sort-btn'));
    el.postList = document.getElementById('post-list');
    el.emptyMessage = document.getElementById('empty-message');
  }

  function bindEvents() {
    el.btnSlackLogin.addEventListener('click', startSlackLogin);
    el.btnLogout.addEventListener('click', logout);

    el.btnManageFavorites.addEventListener('click', () => {
      showScreen('favorites');
      renderFavoritesManageList();
    });
    el.btnGotoFavorites.addEventListener('click', () => {
      showScreen('favorites');
      renderFavoritesManageList();
    });
    el.btnFavoritesBack.addEventListener('click', () => {
      renderConditionUserList();
      showScreen('condition');
    });
    el.favoritesFilter.addEventListener('input', () => renderFavoritesManageList());

    el.userFilter.addEventListener('input', () => renderConditionUserList());
    el.btnFetch.addEventListener('click', fetchPosts);
    el.btnBack.addEventListener('click', () => showScreen('condition'));
    el.sortButtons.forEach((btn) => {
      btn.addEventListener('click', () => onSortClick(btn.dataset.sort));
    });
  }

  // ---------- 画面制御 ----------

  function showScreen(name) {
    Object.entries(el.screens).forEach(([key, node]) => {
      node.classList.toggle('hidden', key !== name);
    });
  }

  function showLoginError(message) {
    el.loginError.textContent = message;
    el.loginError.classList.remove('hidden');
    showScreen('login');
  }

  function showConditionError(message) {
    el.conditionError.textContent = message;
    el.conditionError.classList.remove('hidden');
  }

  function clearConditionError() {
    el.conditionError.classList.add('hidden');
    el.conditionError.textContent = '';
  }

  function setLoadingMessage(message) {
    el.loadingMessage.textContent = message;
  }

  // ---------- OAuth (ユーザートークン) ----------

  function startSlackLogin() {
    if (!state.config || !state.config.clientId) {
      showLoginError('Slackアプリの設定(client_id)が見つかりません。');
      return;
    }
    localStorage.setItem(REMEMBER_KEY, el.chkRemember.checked ? '1' : '0');

    const url = new URL(SLACK_AUTHORIZE_URL);
    url.searchParams.set('client_id', state.config.clientId);
    url.searchParams.set('user_scope', state.config.userScope);
    url.searchParams.set('redirect_uri', state.config.redirectUri);
    window.location.href = url.toString();
  }

  async function handleOAuthCallback(code) {
    showScreen('loading');
    setLoadingMessage('ログイン処理中…');

    // アドレスバーからcodeを消してリロード時の再送信を防ぐ
    window.history.replaceState({}, document.title, window.location.pathname);

    try {
      const result = await fetchJson('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      state.token = result.accessToken;
      const remember = localStorage.getItem(REMEMBER_KEY) !== '0';
      if (remember) {
        localStorage.setItem(TOKEN_KEY, state.token);
      }

      await enterConditionScreen();
    } catch (e) {
      showLoginError('Slackログインに失敗しました。もう一度お試しください。');
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    state.token = null;
    state.users = [];
    state.selectedUserIds.clear();
    state.posts = [];
    showScreen('login');
  }

  // ---------- お気に入りユーザー管理 ----------

  function loadFavoritesFromStorage() {
    try {
      const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function saveFavoritesToStorage() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(state.favoriteIds)));
  }

  function toggleFavorite(userId) {
    if (state.favoriteIds.has(userId)) {
      state.favoriteIds.delete(userId);
      state.selectedUserIds.delete(userId);
    } else {
      state.favoriteIds.add(userId);
    }
    saveFavoritesToStorage();
    renderFavoritesManageList();
  }

  function renderFavoritesManageList() {
    const keyword = el.favoritesFilter.value.trim().toLowerCase();
    const filtered = keyword
      ? state.users.filter((u) => u.name.toLowerCase().includes(keyword))
      : state.users;

    el.favoritesManageList.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'user-empty';
      empty.textContent = '該当するユーザーがいません';
      el.favoritesManageList.appendChild(empty);
      return;
    }

    filtered.forEach((user) => {
      const isFav = state.favoriteIds.has(user.id);

      const row = document.createElement('div');
      row.className = 'favorite-row';

      const nameWrap = document.createElement('div');
      nameWrap.className = 'favorite-name';

      if (user.image) {
        const img = document.createElement('img');
        img.src = user.image;
        img.alt = '';
        nameWrap.appendChild(img);
      }

      const span = document.createElement('span');
      span.textContent = user.name;
      nameWrap.appendChild(span);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-toggle-fav' + (isFav ? ' is-fav' : '');
      btn.textContent = isFav ? '削除' : '追加';
      btn.addEventListener('click', () => toggleFavorite(user.id));

      row.appendChild(nameWrap);
      row.appendChild(btn);
      el.favoritesManageList.appendChild(row);
    });
  }

  // ---------- 条件入力画面 ----------

  async function enterConditionScreen() {
    showScreen('loading');
    setLoadingMessage('ユーザー一覧を取得しています…');
    try {
      await loadUsers();
      renderConditionUserList();
      showScreen('condition');
    } catch (e) {
      logout();
      showLoginError('ユーザー一覧の取得に失敗しました。再度ログインしてください。');
    }
  }

  async function loadUsers() {
    const members = await slackApiPaged('users.list', {}, 'members', 'cursor');
    state.users = members
      .filter((u) => !u.deleted && !u.is_bot && u.id !== 'USLACKBOT')
      .map((u) => ({
        id: u.id,
        name: (u.profile && (u.profile.display_name || u.profile.real_name)) || u.name,
        image: u.profile && (u.profile.image_24 || u.profile.image_original),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }

  function renderConditionUserList() {
    const favoriteUsers = state.users.filter((u) => state.favoriteIds.has(u.id));

    if (favoriteUsers.length === 0) {
      el.userList.innerHTML = '';
      el.favoritesEmptyHint.classList.remove('hidden');
      return;
    }
    el.favoritesEmptyHint.classList.add('hidden');

    const keyword = el.userFilter.value.trim().toLowerCase();
    const filtered = keyword
      ? favoriteUsers.filter((u) => u.name.toLowerCase().includes(keyword))
      : favoriteUsers;

    el.userList.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'user-empty';
      empty.textContent = '該当するユーザーがいません';
      el.userList.appendChild(empty);
      return;
    }

    filtered.forEach((user) => {
      const item = document.createElement('div');
      item.className = 'user-item';

      const label = document.createElement('label');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = user.id;
      checkbox.checked = state.selectedUserIds.has(user.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.selectedUserIds.add(user.id);
        } else {
          state.selectedUserIds.delete(user.id);
        }
      });

      label.appendChild(checkbox);

      if (user.image) {
        const img = document.createElement('img');
        img.src = user.image;
        img.alt = '';
        label.appendChild(img);
      }

      const span = document.createElement('span');
      span.textContent = user.name;
      label.appendChild(span);

      item.appendChild(label);
      el.userList.appendChild(item);
    });
  }

  // ---------- 投稿検索 (Search API) ----------

  async function fetchPosts() {
    clearConditionError();

    if (state.selectedUserIds.size === 0) {
      showConditionError('ユーザーを1人以上選択してください。');
      return;
    }
    if (!el.dateFrom.value || !el.dateTo.value) {
      showConditionError('開始日と終了日を指定してください。');
      return;
    }
    if (el.dateFrom.value > el.dateTo.value) {
      showConditionError('開始日は終了日より前の日付にしてください。');
      return;
    }

    showScreen('loading');
    setLoadingMessage('投稿を検索しています…');

    try {
      // after/beforeは指定日を含まない仕様のため、境界を1日ずらして範囲に含める
      const afterStr = shiftDate(el.dateFrom.value, -1);
      const beforeStr = shiftDate(el.dateTo.value, 1);

      const matches = await searchMessages(Array.from(state.selectedUserIds), afterStr, beforeStr);

      state.posts = matches.map((m) => ({
        userId: m.user,
        userName: resolveUserName(m.user, m.username),
        text: m.text || '',
        ts: m.ts,
        permalink: m.permalink || '',
      }));

      applySort();
      renderPostList();
      showScreen('list');
    } catch (e) {
      showConditionError('投稿の検索に失敗しました。時間を置いて再度お試しください。');
      showScreen('condition');
    }
  }

  async function searchMessages(userIds, afterStr, beforeStr) {
    // 同じ種類の修飾子(from:)はOR、異なる種類(after:/before:)はANDで評価される
    const fromClauses = userIds.map((id) => `from:<@${id}>`).join(' ');
    const query = `${fromClauses} after:${afterStr} before:${beforeStr}`.trim();

    const allMatches = [];
    const maxPages = 20; // 無料プランはそもそも検索範囲が狭いため安全のための上限
    let page = 1;
    let totalPages = 1;

    do {
      const data = await slackApiGet('search.messages', {
        query,
        count: '100',
        page: String(page),
        sort: 'timestamp',
        sort_dir: 'desc',
      });

      const matches = (data.messages && data.messages.matches) || [];
      allMatches.push(...matches);
      totalPages = (data.messages && data.messages.paging && data.messages.paging.pages) || 1;
      page += 1;
    } while (page <= totalPages && page <= maxPages);

    return allMatches;
  }

  function resolveUserName(userId, fallbackName) {
    const user = state.users.find((u) => u.id === userId);
    return (user && user.name) || fallbackName || userId;
  }

  function shiftDate(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ---------- 一覧表示画面 ----------

  function onSortClick(key) {
    if (state.sort.key === key) {
      state.sort.asc = !state.sort.asc;
    } else {
      state.sort.key = key;
      state.sort.asc = true;
    }
    applySort();
    renderPostList();
  }

  function applySort() {
    const { key, asc } = state.sort;
    state.posts.sort((a, b) => {
      let diff = 0;
      if (key === 'user') {
        diff = a.userName.localeCompare(b.userName, 'ja');
      } else {
        diff = Number(a.ts) - Number(b.ts);
      }
      return asc ? diff : -diff;
    });

    el.sortButtons.forEach((btn) => {
      const isActive = btn.dataset.sort === key;
      btn.classList.toggle('active', isActive);
      const icon = btn.querySelector('.sort-icon');
      icon.textContent = isActive ? (asc ? '▲' : '▼') : '';
    });
  }

  function renderPostList() {
    el.resultCount.textContent = String(state.posts.length);
    el.postList.innerHTML = '';

    if (state.posts.length === 0) {
      el.emptyMessage.classList.remove('hidden');
      return;
    }
    el.emptyMessage.classList.add('hidden');

    state.posts.forEach((post) => {
      const li = document.createElement('li');
      li.className = 'post-item';

      const meta = document.createElement('div');
      meta.className = 'post-meta';

      const userSpan = document.createElement('span');
      userSpan.className = 'post-user';
      userSpan.textContent = post.userName;

      const dateSpan = document.createElement('span');
      dateSpan.className = 'post-date';
      dateSpan.textContent = formatDate(post.ts);

      meta.appendChild(userSpan);
      meta.appendChild(dateSpan);

      const text = document.createElement('p');
      text.className = 'post-text';
      text.textContent = post.text;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-open';
      btn.textContent = 'Slackで開く';
      btn.disabled = !post.permalink;
      btn.addEventListener('click', () => {
        if (post.permalink) window.open(post.permalink, '_blank', 'noopener');
      });

      li.appendChild(meta);
      li.appendChild(text);
      li.appendChild(btn);
      el.postList.appendChild(li);
    });
  }

  function formatDate(ts) {
    const d = new Date(Number(ts) * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ---------- Slack API ヘルパー ----------

  async function slackApiGet(method, params) {
    const url = new URL(`${SLACK_API_BASE}/${method}`);
    Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error || 'slack_api_error');
    }
    return data;
  }

  async function slackApiPaged(method, baseParams, itemsKey, cursorKey) {
    const all = [];
    let cursor;
    do {
      const params = { ...baseParams, limit: baseParams.limit || '200' };
      if (cursor) params.cursor = cursor;
      const data = await slackApiGet(method, params);
      all.push(...(data[itemsKey] || []));
      cursor = data.response_metadata && data.response_metadata.next_cursor;
    } while (cursor);
    return all;
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) {
      throw new Error((data && data.error) || 'request_failed');
    }
    return data;
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }
})();
