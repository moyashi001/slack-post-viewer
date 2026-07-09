(() => {
  'use strict';

  const USERS_KEY = 'slack_query_users';
  const CHANNELS_KEY = 'slack_query_channels';
  const PRESETS_KEY = 'slack_query_condition_presets';
  const MAX_PRESETS = 3;

  const state = {
    users: [],      // { name: string, id: string }[]
    channels: [],   // string[]
    selectedUsers: new Set(),
    selectedChannels: new Set(),
    sort: 'user',   // 'user' | 'date'
    presets: [],    // { userNames: string[], channelNames: string[], dateFrom: string, dateTo: string, sort: string }[]
    pendingPresetSnapshot: null,
  };

  const el = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindEvents();
    registerServiceWorker();

    state.users = loadUsers();
    state.channels = loadList(CHANNELS_KEY);
    state.presets = loadPresets();

    renderUserManageList();
    renderChannelManageList();
    renderConditionUserList();
    renderConditionChannelList();
    renderPresetList();

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
    el.inputAddUserId = document.getElementById('input-add-user-id');
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

    el.btnSavePreset = document.getElementById('btn-save-preset');
    el.conditionPresetList = document.getElementById('condition-preset-list');
    el.presetMessage = document.getElementById('preset-message');
    el.presetOverwriteChooser = document.getElementById('preset-overwrite-chooser');
    el.presetOverwriteList = document.getElementById('preset-overwrite-list');
    el.btnCancelOverwrite = document.getElementById('btn-cancel-overwrite');

    el.resultQuery = document.getElementById('result-query');
    el.btnCopy = document.getElementById('btn-copy');
    el.copyMessage = document.getElementById('copy-message');
    el.btnOpenSlack = document.getElementById('btn-open-slack');

    el.btnExport = document.getElementById('btn-export');
    el.btnImport = document.getElementById('btn-import');
    el.exportBox = document.getElementById('export-box');
    el.exportText = document.getElementById('export-text');
    el.btnCopyExport = document.getElementById('btn-copy-export');
    el.exportMessage = document.getElementById('export-message');
    el.importBox = document.getElementById('import-box');
    el.importText = document.getElementById('import-text');
    el.btnDoImport = document.getElementById('btn-do-import');
    el.importMessage = document.getElementById('import-message');
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
      addUser(() => {
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
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset, btn));
    });

    el.btnGenerate.addEventListener('click', generateQuery);
    el.btnCopy.addEventListener('click', copyResult);
    el.btnOpenSlack.addEventListener('click', openSlack);

    el.btnSavePreset.addEventListener('click', onSavePresetClick);
    el.btnCancelOverwrite.addEventListener('click', hideOverwriteChooser);

    el.btnExport.addEventListener('click', openExportBox);
    el.btnImport.addEventListener('click', openImportBox);
    el.btnCopyExport.addEventListener('click', copyExportText);
    el.btnDoImport.addEventListener('click', doImport);
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

  function normalizeMemberId(raw) {
    return raw.trim().replace(/^<@/, '').replace(/>$/, '').replace(/^@/, '');
  }

  // ---------- ユーザー管理 (name + SlackメンバーID) ----------

  function loadUsers() {
    const raw = loadList(USERS_KEY);
    return raw.map((item) => (
      typeof item === 'string' ? { name: item, id: '' } : { name: item.name, id: item.id || '' }
    ));
  }

  function saveUsers() {
    saveList(USERS_KEY, state.users);
  }

  function addUser(onDone) {
    el.userFormError.classList.add('hidden');
    const name = normalizeName(el.inputAddUser.value);
    const id = normalizeMemberId(el.inputAddUserId.value);

    if (!name) {
      el.userFormError.textContent = '名前を入力してください。';
      el.userFormError.classList.remove('hidden');
      return;
    }
    if (!id) {
      el.userFormError.textContent = 'メンバーIDが設定されていません。';
      el.userFormError.classList.remove('hidden');
      return;
    }
    if (state.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
      el.userFormError.textContent = 'すでに登録されています。';
      el.userFormError.classList.remove('hidden');
      return;
    }

    state.users.push({ name, id });
    saveUsers();
    el.inputAddUser.value = '';
    el.inputAddUserId.value = '';
    onDone();
  }

  function removeUser(name, onDone) {
    const idx = state.users.findIndex((u) => u.name === name);
    if (idx !== -1) state.users.splice(idx, 1);
    saveUsers();
    onDone();
  }

  function renameUser(oldName, newNameRaw, newIdRaw, onDone) {
    const newName = normalizeName(newNameRaw);
    const newId = normalizeMemberId(newIdRaw || '');

    if (!newName) {
      el.userFormError.textContent = '名前を入力してください。';
      el.userFormError.classList.remove('hidden');
      return;
    }
    if (!newId) {
      el.userFormError.textContent = 'メンバーIDが設定されていません。';
      el.userFormError.classList.remove('hidden');
      return;
    }

    const idx = state.users.findIndex((u) => u.name === oldName);
    if (idx === -1) return;
    state.users[idx] = { name: newName, id: newId };
    saveUsers();
    el.userFormError.classList.add('hidden');
    onDone();
  }

  function userManageLabel(user) {
    return user.id ? `${user.name} (ID: ${user.id})` : `${user.name} (ID未登録)`;
  }

  function renderUserManageList() {
    const container = el.userManageList;
    container.innerHTML = '';

    if (state.users.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'manage-empty';
      empty.textContent = '登録されていません';
      container.appendChild(empty);
      return;
    }

    const onChange = () => {
      renderUserManageList();
      renderConditionUserList();
    };

    state.users.forEach((user) => {
      const row = document.createElement('div');
      row.className = 'manage-row';

      const nameWrap = document.createElement('span');
      nameWrap.className = 'manage-name';
      nameWrap.textContent = userManageLabel(user);

      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.textContent = '編集';
      btnEdit.addEventListener('click', () => {
        startEditUser(row, user, onChange);
      });

      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'btn-delete';
      btnDelete.textContent = '削除';
      btnDelete.addEventListener('click', () => {
        removeUser(user.name, onChange);
      });

      row.appendChild(nameWrap);
      row.appendChild(btnEdit);
      row.appendChild(btnDelete);
      container.appendChild(row);
    });
  }

  function startEditUser(row, user, onChange) {
    row.innerHTML = '';
    row.classList.add('manage-row-editing');

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'manage-edit-input';
    nameInput.value = user.name;
    nameInput.placeholder = 'ユーザー名';

    const idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.className = 'manage-edit-input';
    idInput.value = user.id;
    idInput.placeholder = 'SlackメンバーID';

    const btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'btn-save';
    btnSave.textContent = '保存';
    btnSave.addEventListener('click', () => {
      renameUser(user.name, nameInput.value, idInput.value, onChange);
    });

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.textContent = 'キャンセル';
    btnCancel.addEventListener('click', onChange);

    row.appendChild(nameInput);
    row.appendChild(idInput);
    row.appendChild(btnSave);
    row.appendChild(btnCancel);
    nameInput.focus();
  }

  // ---------- チャンネル管理 (共通ロジック) ----------

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
      state.users.map((u) => ({ value: u.name, label: u.id ? u.name : `${u.name} (ID未登録)` })),
      state.selectedUsers
    );
  }

  function renderConditionChannelList() {
    renderConditionCheckList(
      el.conditionChannelList,
      el.conditionChannelEmpty,
      state.channels.map((c) => ({ value: c, label: c })),
      state.selectedChannels
    );
  }

  function renderConditionCheckList(container, emptyEl, items, selectedSet) {
    // 削除されたアイテムが選択状態に残らないようにする
    const values = items.map((item) => item.value);
    Array.from(selectedSet).forEach((value) => {
      if (!values.includes(value)) selectedSet.delete(value);
    });

    container.innerHTML = '';

    if (items.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    items.forEach(({ value, label: itemLabel }) => {
      const item = document.createElement('div');
      item.className = 'check-item';

      const label = document.createElement('label');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedSet.has(value);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedSet.add(value);
        } else {
          selectedSet.delete(value);
        }
      });

      const span = document.createElement('span');
      span.textContent = itemLabel;

      label.appendChild(checkbox);
      label.appendChild(span);
      item.appendChild(label);
      container.appendChild(item);
    });
  }

  // ---------- 日付プリセット ----------

  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=日, 1=月, ... 6=土
    const diffToMonday = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diffToMonday);
    return d;
  }

  function applyPreset(preset, btn) {
    const today = new Date();
    let from;
    let to;

    switch (preset) {
      case 'today':
        from = new Date(today);
        to = new Date(today);
        break;
      case 'yesterday': {
        const d = new Date(today);
        d.setDate(d.getDate() - 1);
        from = new Date(d);
        to = new Date(d);
        break;
      }
      case 'dayBeforeYesterday': {
        const d = new Date(today);
        d.setDate(d.getDate() - 2);
        from = new Date(d);
        to = new Date(d);
        break;
      }
      case 'thisWeek':
        // 今週はまだ終わっていないため、終了日は今日にする
        from = getWeekStart(today);
        to = new Date(today);
        break;
      case 'lastWeek': {
        const thisWeekStart = getWeekStart(today);
        to = new Date(thisWeekStart);
        to.setDate(to.getDate() - 1);
        from = new Date(thisWeekStart);
        from.setDate(from.getDate() - 7);
        break;
      }
      case 'thisMonth':
        // 今月もまだ終わっていないため、終了日は今日にする
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        to = new Date(today);
        break;
      case 'twoMonthsAgo':
        from = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        to = new Date(today.getFullYear(), today.getMonth() - 1, 0);
        break;
      case 'threeMonthsAgo':
        from = new Date(today.getFullYear(), today.getMonth() - 3, 1);
        to = new Date(today.getFullYear(), today.getMonth() - 2, 0);
        break;
      default:
        return;
    }

    el.dateFrom.value = formatDateInput(from);
    el.dateTo.value = formatDateInput(to);

    el.presetButtons.forEach((b) => b.classList.toggle('active', b === btn));
  }

  function formatDateInput(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ---------- 検索条件プリセット (最大3件保存) ----------

  function loadPresets() {
    const raw = loadList(PRESETS_KEY);
    return raw
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({
        userNames: Array.isArray(p.userNames) ? p.userNames : [],
        channelNames: Array.isArray(p.channelNames) ? p.channelNames : [],
        dateFrom: p.dateFrom || '',
        dateTo: p.dateTo || '',
        sort: p.sort === 'date' ? 'date' : 'user',
      }))
      .slice(0, MAX_PRESETS);
  }

  function savePresets() {
    saveList(PRESETS_KEY, state.presets);
  }

  function buildPresetSnapshot() {
    return {
      userNames: Array.from(state.selectedUsers),
      channelNames: Array.from(state.selectedChannels),
      dateFrom: el.dateFrom.value,
      dateTo: el.dateTo.value,
      sort: document.querySelector('input[name="sort"]:checked').value,
    };
  }

  function presetSummary(preset) {
    const parts = [];
    parts.push(`ユーザー${preset.userNames.length}件`);
    parts.push(`チャンネル${preset.channelNames.length}件`);
    if (preset.dateFrom || preset.dateTo) {
      parts.push(`${preset.dateFrom || '未指定'}〜${preset.dateTo || '未指定'}`);
    }
    return parts.join(' / ');
  }

  function renderPresetList() {
    el.conditionPresetList.innerHTML = '';

    if (state.presets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'preset-condition-empty';
      empty.textContent = '保存された条件はありません';
      el.conditionPresetList.appendChild(empty);
      return;
    }

    state.presets.forEach((preset, index) => {
      const row = document.createElement('div');
      row.className = 'preset-condition-row';

      const summary = document.createElement('span');
      summary.className = 'preset-summary';
      summary.textContent = `プリセット${index + 1}: ${presetSummary(preset)}`;

      const btnApply = document.createElement('button');
      btnApply.type = 'button';
      btnApply.textContent = '適用';
      btnApply.addEventListener('click', () => applyConditionPreset(index));

      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'btn-delete';
      btnDelete.textContent = '削除';
      btnDelete.addEventListener('click', () => deletePreset(index));

      row.appendChild(summary);
      row.appendChild(btnApply);
      row.appendChild(btnDelete);
      el.conditionPresetList.appendChild(row);
    });
  }

  function onSavePresetClick() {
    el.presetMessage.classList.add('hidden');
    const snapshot = buildPresetSnapshot();

    if (state.presets.length < MAX_PRESETS) {
      state.presets.push(snapshot);
      savePresets();
      renderPresetList();
      showPresetMessage('保存しました');
      return;
    }

    showOverwriteChooser(snapshot);
  }

  function showOverwriteChooser(snapshot) {
    state.pendingPresetSnapshot = snapshot;
    el.presetOverwriteList.innerHTML = '';

    state.presets.forEach((preset, index) => {
      const row = document.createElement('div');
      row.className = 'preset-overwrite-row';

      const summary = document.createElement('span');
      summary.textContent = `プリセット${index + 1}: ${presetSummary(preset)}`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'ここに上書き';
      btn.addEventListener('click', () => overwritePreset(index));

      row.appendChild(summary);
      row.appendChild(btn);
      el.presetOverwriteList.appendChild(row);
    });

    el.presetOverwriteChooser.classList.remove('hidden');
  }

  function hideOverwriteChooser() {
    state.pendingPresetSnapshot = null;
    el.presetOverwriteChooser.classList.add('hidden');
  }

  function overwritePreset(index) {
    if (!state.pendingPresetSnapshot) return;
    state.presets[index] = state.pendingPresetSnapshot;
    savePresets();
    hideOverwriteChooser();
    renderPresetList();
    showPresetMessage('上書きしました');
  }

  function deletePreset(index) {
    state.presets.splice(index, 1);
    savePresets();
    renderPresetList();
  }

  function applyConditionPreset(index) {
    const preset = state.presets[index];
    if (!preset) return;

    state.selectedUsers = new Set(preset.userNames.filter((name) => state.users.some((u) => u.name === name)));
    state.selectedChannels = new Set(preset.channelNames.filter((name) => state.channels.includes(name)));
    el.dateFrom.value = preset.dateFrom;
    el.dateTo.value = preset.dateTo;

    const sortRadio = document.querySelector(`input[name="sort"][value="${preset.sort}"]`);
    if (sortRadio) sortRadio.checked = true;

    renderConditionUserList();
    renderConditionChannelList();
    showPresetMessage(`プリセット${index + 1}を適用しました`);
  }

  function showPresetMessage(text) {
    el.presetMessage.textContent = text;
    el.presetMessage.classList.remove('hidden');
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

    const noIdUsers = state.users.filter((u) => selectedUsers.includes(u.name) && !u.id);
    if (noIdUsers.length > 0) {
      el.conditionError.textContent = `メンバーIDが未登録のため検索できません: ${noIdUsers.map((u) => u.name).join('、')}`;
      el.conditionError.classList.remove('hidden');
      return;
    }

    const userClause = buildUserClause(selectedUsers);
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

  function buildUserClause(selectedNames) {
    if (selectedNames.length === 0) return '';
    const selected = state.users.filter((u) => selectedNames.includes(u.name));
    const sorted = selected.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    const terms = sorted.map((u) => `from:<@${u.id}>`);
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

  function openSlack() {
    // Slackアプリ(デスクトップ/モバイル)のカスタムURLスキームで検索画面を開く
    const query = el.resultQuery.textContent;
    window.location.href = `slack://search?query=${encodeURIComponent(query)}`;
  }

  // ---------- エクスポート/インポート (端末間の手動同期) ----------

  function openExportBox() {
    el.importBox.classList.add('hidden');
    el.exportMessage.classList.add('hidden');

    const payload = { users: state.users, channels: state.channels, presets: state.presets };
    el.exportText.value = JSON.stringify(payload);
    el.exportBox.classList.remove('hidden');
    el.exportText.focus();
    el.exportText.select();
  }

  function openImportBox() {
    el.exportBox.classList.add('hidden');
    el.importMessage.classList.add('hidden');
    el.importText.value = '';
    el.importBox.classList.remove('hidden');
    el.importText.focus();
  }

  async function copyExportText() {
    const text = el.exportText.value;
    try {
      await navigator.clipboard.writeText(text);
      el.exportMessage.classList.remove('hidden');
    } catch (e) {
      el.exportText.focus();
      el.exportText.select();
      try {
        document.execCommand('copy');
        el.exportMessage.classList.remove('hidden');
      } catch (e2) {
        // 何もしない(手動選択でコピーしてもらう)
      }
    }
  }

  function doImport() {
    el.importMessage.classList.add('hidden');

    let data;
    try {
      data = JSON.parse(el.importText.value);
    } catch (e) {
      el.importMessage.textContent = 'テキストの形式が正しくありません。';
      el.importMessage.classList.remove('hidden');
      return;
    }

    if (!data || !Array.isArray(data.users) || !Array.isArray(data.channels)) {
      el.importMessage.textContent = 'テキストの形式が正しくありません。';
      el.importMessage.classList.remove('hidden');
      return;
    }

    state.users = data.users.map((item) => (
      typeof item === 'string'
        ? { name: item, id: '' }
        : { name: String(item.name || ''), id: String(item.id || '') }
    )).filter((u) => u.name);
    state.channels = data.channels.map((item) => String(item)).filter(Boolean);
    state.presets = Array.isArray(data.presets)
      ? data.presets.filter((p) => p && typeof p === 'object').map((p) => ({
          userNames: Array.isArray(p.userNames) ? p.userNames : [],
          channelNames: Array.isArray(p.channelNames) ? p.channelNames : [],
          dateFrom: p.dateFrom || '',
          dateTo: p.dateTo || '',
          sort: p.sort === 'date' ? 'date' : 'user',
        })).slice(0, MAX_PRESETS)
      : [];
    state.selectedUsers.clear();
    state.selectedChannels.clear();

    saveUsers();
    saveList(CHANNELS_KEY, state.channels);
    savePresets();

    renderUserManageList();
    renderChannelManageList();
    renderConditionUserList();
    renderConditionChannelList();
    renderPresetList();

    el.importBox.classList.add('hidden');
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }
})();
