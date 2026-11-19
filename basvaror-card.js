class BasvarorCard extends HTMLElement {
  setConfig(config) {
    this.inventory = config.inventory || 'todo.basvarulager';
    this.automation = config.automation || 'automation.basvaror_sync_shopping_list';
    this.shoppingList = config.shopping_list || 'todo.shopping_list';
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot) this.mount();
  }

  getCardSize() { return 4; }

  mount() {
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display:block; color:var(--primary-text-color); }
        h2,h3,p { margin:0; }
        h2 { font-size:1.25rem; }
        h3 { font-size:1.12rem; }
        .panel { padding:16px; }
        .rows,form { display:grid; gap:12px; }
        .rows:not(:empty) { margin:0 0 8px; }
        .line { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; }
        summary { cursor:pointer; color:var(--primary-color); padding:10px 0 2px; }
        form { margin-top:10px; }
        .numbers { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        label { display:grid; gap:4px; font-size:.875rem; }
        input { box-sizing:border-box; width:100%; min-height:38px; border:1px solid var(--divider-color); border-radius:6px; padding:6px 8px; font:inherit; color:inherit; background:var(--card-background-color); }
        button { border:0; border-radius:20px; min-height:36px; padding:0 14px; font:inherit; font-weight:600; color:var(--primary-color); background:var(--secondary-background-color); cursor:pointer; }
        button:disabled { opacity:.48; cursor:default; }
        .status { color:var(--secondary-text-color); margin-top:8px; }
        .status:empty { display:none; }
        .status.error { color:var(--error-color); }
      </style>
      <div class="rows"></div>
      <ha-card class="panel">
        <details>
          <summary>Lägg till basvara</summary>
          <form id="add">
            <label>Namn<input name="name" required maxlength="90"></label>
            <div class="numbers">
              <label>I lager<input name="stock" type="number" min="0" max="99999" step="1" required></label>
              <label>Miniminivå<input name="minimum" type="number" min="0" max="99999" step="1" required></label>
            </div>
            <button type="submit">Lägg till</button>
          </form>
        </details>
        <div class="line"><button id="refresh">Uppdatera inköpslistan</button></div>
        <p class="status" role="status"></p>
      </ha-card>`;
    this.status = this.shadowRoot.querySelector('.status');
    this.rows = this.shadowRoot.querySelector('.rows');
    const searchPanel = document.createElement('ha-card');
    searchPanel.className = 'panel';
    searchPanel.style.marginBottom = '8px';
    searchPanel.innerHTML = `
      <label>Sök basvaror<input type="search" placeholder="Sök på namn" autocomplete="off"></label>
      <p class="status" role="status"></p>`;
    this.rows.before(searchPanel);
    const searchInput = searchPanel.querySelector('input');
    const feedback = searchPanel.querySelector('[role="status"]');
    const normalize = (value) => value.toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const filterRows = () => {
      const query = normalize(searchInput.value.trim());
      let matches = 0;
      for (const card of this.rows.children) {
        const visible = normalize(card.querySelector('h3').textContent).includes(query);
        card.style.display = visible ? '' : 'none';
        if (visible) matches += 1;
      }
      feedback.textContent = query && !matches ? 'Inga basvaror matchar sökningen.' : '';
    };
    searchInput.addEventListener('input', filterRows);
    new MutationObserver(filterRows).observe(this.rows, { childList: true });
    const add = this.shadowRoot.querySelector('#add');
    add.addEventListener('submit', (event) => {
      event.preventDefault();
      this.run(async () => {
        const data = new FormData(add);
        const name = data.get('name').trim();
        if (!name || /[|]/.test(name) || name.includes(' — ')) {
          throw new Error('Ange ett namn utan lodstreck eller långt tankstreck med mellanslag.');
        }
        const key = name.toLowerCase();
        const rows = await this.readItems();
        if (rows.some((row) => row.name.toLowerCase() === key)) {
          throw new Error('Basvaran finns redan. Ändra den under Detaljer.');
        }
        await this._hass.callService('todo', 'add_item', {
          item: this.summary(name, Number(data.get('stock')), Number(data.get('minimum'))),
        }, { entity_id: this.inventory });
        add.reset();
        add.parentElement.open = false;
        await this.sync();
      });
    });
    this.shadowRoot.querySelector('#refresh').addEventListener('click', () => this.run(() => this.sync()));
    this.run(() => this.load());
  }

  summary(name, stock, minimum) {
    return [name, stock, minimum].join(' | ');
  }

  async readItems() {
    const result = await this._hass.callWS({
      type: 'call_service', domain: 'todo', service: 'get_items',
      target: { entity_id: this.inventory },
      service_data: { status: 'needs_action' }, return_response: true,
    });
    const items = result.response[this.inventory].items;
    const rows = [];
    const names = new Set();
    for (const item of items) {
      const fields = item.summary.split('|').map((part) => part.trim());
      const [name, stock, minimum] = fields;
      if (fields.length !== 3 || !name || name.includes(' — ') || !/^\d+$/.test(stock) || !/^\d+$/.test(minimum)) continue;
      const key = name.toLowerCase();
      if (names.has(key)) continue;
      names.add(key);
      rows.push({ uid: item.uid, name, stock: Number(stock), minimum: Number(minimum) });
    }
    return rows;
  }

  async load() {
    const rows = await this.readItems();
    const open = new Set(Array.from(this.rows.querySelectorAll('details[open]'), (item) => item.dataset.uid));
    this.rows.replaceChildren(...rows.map((item) => this.makeRow(item, open.has(item.uid))));
  }

  async sync() {
    await this.load();
    await this._hass.callService('automation', 'trigger', {}, { entity_id: this.automation });
  }

  async update(uid, change) {
    const rows = await this.readItems();
    const item = rows.find((row) => row.uid === uid);
    if (!item) throw new Error('Basvaran finns inte längre. Uppdatera inköpslistan.');
    const { name = item.name, stock, minimum } = change(item);
    const rename = name !== item.name;
    if (rename && (!name || name.includes('|') || name.includes(' — '))) {
      throw new Error('Ange ett namn utan lodstreck eller långt tankstreck med mellanslag.');
    }
    if (rename && rows.some((row) => row.uid !== uid && row.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('En basvara med det namnet finns redan.');
    }
    const shoppingChange = rename ? await this.shoppingRename(item.name, name) : null;
    const saveInventory = (summary) => this._hass.callService('todo', 'update_item', {
      item: uid, rename: summary,
    }, { entity_id: this.inventory });
    await saveInventory(this.summary(name, stock, minimum));
    if (shoppingChange) {
      try {
        await this._hass.callService('todo', 'update_item', shoppingChange, { entity_id: this.shoppingList });
      } catch (error) {
        await saveInventory(this.summary(item.name, item.stock, item.minimum));
        throw error;
      }
    }
    await this.sync();
  }

  async shoppingRename(oldName, newName) {
    const entity = this.shoppingList;
    const result = await this._hass.callWS({
      type: 'call_service', domain: 'todo', service: 'get_items',
      target: { entity_id: entity },
      service_data: { status: 'needs_action' }, return_response: true,
    });
    const entries = result.response[entity].items;
    const split = (entry) => entry.summary.split(' — ');
    const key = (entry) => split(entry)[0].trim().toLowerCase();
    const managed = (entry) => {
      const parts = split(entry);
      return parts.length === 2 && /^\d+ (st|kartonger?)$/.test(parts[1]);
    };
    const oldEntry = entries.find((entry) => key(entry) === oldName.toLowerCase() && managed(entry));
    if (!oldEntry) return null;
    const existing = entries.some((entry) => entry.uid !== oldEntry.uid && key(entry) === newName.toLowerCase()
      && (managed(entry) || split(entry).length === 1));
    return existing ? { item: oldEntry.uid, status: 'completed' }
      : { item: oldEntry.uid, rename: newName + ' — ' + split(oldEntry)[1] };
  }

  makeRow(item, open) {
    const card = document.createElement('ha-card');
    card.className = 'panel';
    card.innerHTML = `
      <h3></h3>
      <div class="line"><span class="stock"></span></div>
      <div class="line"><span>Markera förbrukning</span><button class="use">Använd en</button></div>
      <details><summary>Detaljer</summary>
        <form>
          <label>Namn<input name="name" required maxlength="90"></label>
          <div class="numbers">
            <label>I lager<input name="stock" type="number" min="0" max="99999" step="1" required></label>
            <label>Miniminivå<input name="minimum" type="number" min="0" max="99999" step="1" required></label>
          </div>
          <button type="submit">Spara</button>
        </form>
      </details>`;
    card.querySelector('h3').textContent = item.name;
    card.querySelector('.stock').textContent = 'I lager: ' + item.stock;
    const details = card.querySelector('details');
    details.dataset.uid = item.uid;
    details.open = open;
    const use = card.querySelector('.use');
    use.disabled = item.stock <= 0;
    if (use.disabled) use.dataset.empty = 'true';
    use.addEventListener('click', () => this.run(() => this.update(item.uid, (latest) => ({
      stock: Math.max(0, latest.stock - 1), minimum: latest.minimum,
    }))));
    const form = card.querySelector('form');
    form.elements.name.value = item.name;
    form.elements.stock.value = item.stock;
    form.elements.minimum.value = item.minimum;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      this.run(() => this.update(item.uid, () => ({
        name: data.get('name').trim(),
        stock: Number(data.get('stock')), minimum: Number(data.get('minimum')),
      })));
    });
    return card;
  }

  async run(action) {
    if (this.busy) return;
    this.busy = true;
    this.status.classList.remove('error');
    this.status.textContent = 'Uppdaterar …';
    this.shadowRoot.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    try {
      await action();
      this.status.textContent = '';
    } catch (error) {
      this.status.classList.add('error');
      this.status.textContent = error.message || 'Det gick inte att uppdatera inköpslistan.';
    } finally {
      this.shadowRoot.querySelectorAll('button').forEach((button) => { button.disabled = button.dataset.empty === 'true'; });
      this.busy = false;
    }
  }
}

if (!customElements.get('basvaror-card')) customElements.define('basvaror-card', BasvarorCard);
