(() => {
  'use strict';

  const USERS_KEY = 'slack_query_users';
  const CHANNELS_KEY = 'slack_query_channels';

  const state = {
    users: [],      // string[]
    channels: [],   // string[]
    selectedUsers: new Set(),
    selectedChannels: new Set(),
    sort: 'user',   // 'user' | 'date'
  };

  const el = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindEvents();
    registerServiceWorker();

    state.users = loadList(USERS_KEY);
    state.channels = loadList(CHANNELS_KEY);

    renderUserManageList();
    renderChannelManageList();
    renderConditionUserList();
    renderConditionChannelList();

    showScreen('home');
  }

  function cacheElements() {
    el.screens = {
      home: document.getElementById('screen-home'),
      users: document.getElementById('screen-users'),
      channels: document.getElementById('screen-channels'),
      condition: document.getElementById('screen-condition'),
      result: document.getElementById('screen-result'),
    };

    el.btnGotoCondition = document.getElementById('btn-goto-condition');
    el.btnGotoUsers = document.getElementById('btn-goto-users');
    el.btnGotoChannels = document.getElementById('btn-goto-channels');

    el.userManageList = document.getElementById('user-manage-list');
    el.formAddUser = document.getElementById('form-add-user');
    el.inputAddUser = document.getElementById('input-add-user');
    el.userFormError = document.getElementById('user-form-error');

    el.channelManageList = document.getElementById('channel-manage-list');
    el.formAddChannel = document.getElementById('form-add-channel');
    el.inputAddChannel = document.getElementById('input-add-channel');
    el.channelFormError = document.getElementById('channel-form-error');

    el.conditionUserList = document.getElementById('condition-user-list');
    el.conditionUserEmpty = document.getElementById('condition-user-empty');
    el.conditionChannelList = document.getElementById('condition-channel-list');
    el.conditionChannelEmpty = document.getElementById('condition-channel-empty');
    el.presetButtons = Array.from(document.querySelectorAll('.preset-btn'));
    el.dateFrom = document.getElementById('date-from');
    el.dateTo = document.getElementById('date-to');
    el.btnGenerate = document.getElementById('btn-generate');
    el.conditionError = document.getElementById('condition-error');

    el.resultQuery = document.getElementById('result-query');
    el.btnCopy = document.getElementById('btn-copy');
    el.copyMessage = document.getElementById('copy-message');
  }

  function bindEvents() {
    el.btnGotoCondition.addEventListener('click', () => showScreen('condition'));
    el.btnGotoUsers.addEventListener('click', () => showScreen('users'));
    el.btnGotoChannels.addEventListener('click', () => showScreen('channels'));

    document.querySelectorAll('[data-back]').forEach((btn) => {
      btn.addEventListener('click', () => showScreen(btn.dataset.back));
    });
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => showScreen(btn.dataset.nav));
    });

    el.formAddUser.addEventListener('submit', (e) => {
      e.preventDefault();
      addItem(state.users, USERS_KEY, el.inputAddUser, el.userFormError, () => {
        renderUserManageList();
        renderConditionUserList();
      });
    });

    el.formAddChannel.addEventListener('submit', (e) => {
      e.preventDefault();
      addItem(state.channels, CHANNELS_KEY, el.inputAddChannel, el.channelFormError, () => {
        renderChannelManageList();
        renderConditionChannelList();
      });
    });

    el.presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => applyPreset(Number(btn.dataset.days), btn));
    });

    el.btnGenerate.addEventListener('click', generateQuery);
    el.btnCopy.addEventListener('click', copyResult);
  }

  // ---------- 画面制御 ----------

  function showScreen(name) {
    if (!el.screens[name]) return;
    Object.entries(el.screens).forEach(([key, node]) => {
      node.classList.toggle('hidden', key !== name);
    });
  }

  // ---------- LocalStorage ----------

  function loadList(key) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function saveList(key, list) {
    localStorage.setItem(key, JSON.stringify(list));
  }

  function normalizeName(raw) {
    return raw.trim().replace(/^[@#]/, '');
  }

  // ---------- ユーザー/チャンネル管理 (共通ロジック) ----------

  function addItem(list, storageKey, inputEl, errorEl, onDone) {
    errorEl.classList.add('hidden');
    const name = normalizeName(inputEl.value);

    if (!name) {
      errorEl.textContent = '名前を入力してください。';
      errorEl.classList.remove('hidden');
      return;
    }
    if (list.some((item) => item.toLowerCase() === name.toLowerCase())) {
      errorEl.textContent = 'すでに登録されています。';
      errorEl.classList.remove('hidden');
      return;
    }

    list.push(name);
    saveList(storageKey, list);
    inputEl.value = '';
    onDone();
  }

  function removeItem(list, storageKey, name, onDone) {
    const idx = list.indexOf(name);
    if (idx !== -1) list.splice(idx, 1);
    saveList(storageKey, list);
    onDone();
  }

  function renameItem(list, storageKey, oldName, newNameRaw, onDone) {
    const newName = normalizeName(newNameRaw);
    if (!newName) return;
    const idx = list.indexOf(oldName);
    if (idx === -1) return;
    list[idx] = newName;
    saveList(storageKey, list);
    onDone();
  }

  function renderManageList(container, list, storageKey, onChange) {
    container.innerHTML = '';

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'manage-empty';
      empty.textContent = '登録されていません';
      container.appendChild(empty);
      return;
    }

    list.forEach((name) => {
      const row = document.createElement('div');
      row.className = 'manage-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'manage-name';
      nameSpan.textContent = name;

      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.textContent = '編集';

      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'btn-delete';
      btnDelete.textContent = '削除';
      btnDelete.addEventListener('click', () => {
        removeItem(list, storageKey, name, onChange);
      });

      btnEdit.addEventListener('click', () => {
        startEdit(row, name, list, storageKey, onChange);
      });

      row.appendChild(nameSpan);
      row.appendChild(btnEdit);
      row.appendChild(btnDelete);
      container.appendChild(row);
    });
  }

  function startEdit(row, oldName, list, storageKey, onChange) {
    row.innerHTML = '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'manage-edit-input';
    input.value = oldName;

    const btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'btn-save';
    btnSave.textContent = '保存';
    btnSave.addEventListener('click', () => {
      renameItem(list, storageKey, oldName, input.value, onChange);
    });

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.textContent = 'キャンセル';
    btnCancel.addEventListener('click', onChange);

    row.appendChild(input);
    row.appendChild(btnSave);
    row.appendChild(btnCancel);
    input.focus();
  }

  function renderUserManageList() {
    renderManageList(el.userManageList, state.users, USERS_KEY, () => {
      renderUserManageList();
      renderConditionUserList();
    });
  }

  function renderChannelManageList() {
    renderManageList(el.channelManageList, state.channels, CHANNELS_KEY, () => {
      renderChannelManageList();
      renderConditionChannelList();
    });
  }

  // ---------- 条件入力画面: チェックリスト ----------

  function renderConditionUserList() {
    renderConditionCheckList(
      el.conditionUserList,
      el.conditionUserEmpty,
      state.users,
      state.selectedUsers
    );
  }

  function renderConditionChannelList() {
    renderConditionCheckList(
      el.conditionChannelList,
      el.conditionChannelEmpty,
      state.channels,
      state.selectedChannels
    );
  }

  function renderConditionCheckList(container, emptyEl, list, selectedSet) {
    // 削除されたアイテムが選択状態に残らないようにする
    Array.from(selectedSet).forEach((name) => {
      if (!list.includes(name)) selectedSet.delete(name);
    });

    container.innerHTML = '';

    if (list.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    list.forEach((name) => {
      const item = document.createElement('div');
      item.className = 'check-item';

      const label = document.createElement('label');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedSet.has(name);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedSet.add(name);
        } else {
          selectedSet.delete(name);
        }
      });

      const span = document.createElement('span');
      span.textContent = name;

      label.appendChild(checkbox);
      label.appendChild(span);
      item.appendChild(label);
      container.appendChild(item);
    });
  }

  // ---------- 日付プリセット ----------

  function applyPreset(days, btn) {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - (days - 1));

    el.dateFrom.value = formatDateInput(from);
    el.dateTo.value = formatDateInput(today);

    el.presetButtons.forEach((b) => b.classList.toggle('active', b === btn));
  }

  function formatDateInput(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ---------- 検索文言生成 ----------

  function generateQuery() {
    el.conditionError.classList.add('hidden');

    const selectedUsers = Array.from(state.selectedUsers);
    const selectedChannels = Array.from(state.selectedChannels);
    const dateFrom = el.dateFrom.value;
    const dateTo = el.dateTo.value;
    const sort = document.querySelector('input[name="sort"]:checked').value;

    if (selectedUsers.length === 0 && selectedChannels.length === 0 && !dateFrom && !dateTo) {
      el.conditionError.textContent = '検索条件を1つ以上指定してください。';
      el.conditionError.classList.remove('hidden');
      return;
    }

    const userClause = buildOrClause(selectedUsers, 'from:@');
    const channelClause = buildOrClause(selectedChannels, 'in:#');
    const dateClause = buildDateClause(dateFrom, dateTo);

    const blocks = sort === 'date'
      ? [dateClause, userClause, channelClause]
      : [userClause, dateClause, channelClause];

    // Slackの検索欄は改行を含む貼り付けを正しく解釈できないことがあるため、
    // 見た目の区切りではなく半角スペースのみで1行に連結する
    const query = blocks.filter(Boolean).join(' ');

    el.resultQuery.textContent = query;
    el.copyMessage.classList.add('hidden');
    showScreen('result');
  }

  function buildOrClause(names, prefix) {
    if (names.length === 0) return '';
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'ja'));
    const terms = sorted.map((name) => `${prefix}${name}`);
    return terms.length > 1 ? `( ${terms.join(' OR ')} )` : terms[0];
  }

  function buildDateClause(fromStr, toStr) {
    const parts = [];
    if (fromStr) parts.push(`after:${fromStr}`);
    if (toStr) parts.push(`before:${toStr}`);
    return parts.join(' ');
  }

  async function copyResult() {
    const text = el.resultQuery.textContent;
    try {
      await navigator.clipboard.writeText(text);
      el.copyMessage.classList.remove('hidden');
    } catch (e) {
      // クリップボードAPIが使えない環境向けのフォールバック
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
        el.copyMessage.classList.remove('hidden');
      } catch (e2) {
        // 何もしない(手動選択でコピーしてもらう)
      }
      document.body.removeChild(textarea);
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }
})();
