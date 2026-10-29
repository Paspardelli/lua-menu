/* ============================================================
   Camada de dados (Store) - multi-lojas
   Dois "drivers" com a MESMA interface:
     - local    : localStorage (demonstração)
     - supabase : banco online via REST (produção)
   Todas as telas conversam só com window.Store.
   ============================================================ */
(function () {
  const CFG = window.LM_CONFIG;
  const { money, resolveLine } = window.LM;
  const STATUS = ["novo", "preparando", "pronto", "entregue", "cancelado"];
  const DEFAULT_SETTINGS = { open: true, pickupEnabled: true, deliveryEnabled: true, deliveryFee: 0, minOrder: 0, avgPrepMinutes: 25 };
  const DEFAULT_INFO = { address: "", whatsapp: "", hours: "", payments: ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito"] };

  function genCode() {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = "";
    for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return "LM-" + s;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const publicTenant = (t) => { const { pin, billing, ...rest } = t; return rest; };

  /* ============================== LOCAL ============================== */
  const Local = (() => {
    const read = (k, fb) => window.LM.lsGet(k, fb);
    const write = (k, v) => window.LM.lsSet(k, v);
    const KT = "lm_tenants", KP = (s) => "lm_p_" + s, KO = (s) => "lm_o_" + s;
    const SA = "lm_auth_agency", SO = (s) => "lm_auth_" + s;
    const tenants = () => read(KT, []);

    function checkOrderInput(t, type) {
      if (!t || !t.active) throw new Error("Esta loja está indisponível.");
      if (!t.settings.open) throw new Error("A loja está fechada no momento.");
      if (type === "retirada" && !t.settings.pickupEnabled) throw new Error("Retirada indisponível.");
      if (type === "entrega" && !t.settings.deliveryEnabled) throw new Error("Entrega indisponível.");
      if (type !== "retirada" && type !== "entrega") throw new Error("Tipo de pedido inválido.");
    }

    return {
      mode: "local",
      async init() {
        if (!read(KT, null)) {
          write(KT, clone(window.LM_SEED.tenants));
          Object.entries(window.LM_SEED.products).forEach(([s, list]) => write(KP(s), clone(list)));
        }
      },
      /* ---- lojas ---- */
      async listTenants() { return tenants(); },
      async listPublicTenants() { return tenants().filter((t) => t.active).map(publicTenant); },
      async getTenant(slug) { const t = tenants().find((x) => x.slug === slug); return t ? publicTenant(t) : null; },
      async getTenantFull(slug) { return tenants().find((x) => x.slug === slug) || null; },
      async saveTenant(slug, patch) {
        const all = tenants(); const t = all.find((x) => x.slug === slug); if (!t) throw new Error("Loja não encontrada.");
        for (const k of Object.keys(patch)) {
          if (["settings", "info", "theme", "billing"].includes(k)) t[k] = { ...(t[k] || {}), ...patch[k] }; else t[k] = patch[k];
        }
        write(KT, all); return publicTenant(t);
      },
      async createTenant(t) {
        const all = tenants();
        if (all.some((x) => x.slug === t.slug)) throw new Error("Já existe uma loja com esse endereço.");
        const full = {
          slug: t.slug, name: t.name, tagline: t.tagline || "", logo: t.logo || "", cover: t.cover || "",
          theme: { primary: "#5b3df5", accent: "#ffb703", ...(t.theme || {}) },
          info: { ...DEFAULT_INFO, ...(t.info || {}) }, settings: { ...DEFAULT_SETTINGS, ...(t.settings || {}) },
          categories: t.categories || clone(window.LM_DEFAULT_CATEGORIES), active: true, pin: t.pin || "1234",
          billing: { plan: "Mensal", price: 0, since: new Date().toISOString().slice(0, 10), notes: "", ...(t.billing || {}) }
        };
        all.push(full); write(KT, all); write(KP(full.slug), []); write(KO(full.slug), []); return full;
      },
      async deleteTenant(slug) {
        write(KT, tenants().filter((t) => t.slug !== slug));
        localStorage.removeItem(KP(slug)); localStorage.removeItem(KO(slug));
      },
      /* ---- produtos / estoque ---- */
      async getProducts(slug) { return read(KP(slug), []); },
      async saveProduct(slug, p) {
        const list = read(KP(slug), []);
        if (!p.id) p.id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
        const i = list.findIndex((x) => x.id === p.id);
        if (i >= 0) list[i] = { ...list[i], ...p }; else list.push(p);
        write(KP(slug), list); return p;
      },
      async deleteProduct(slug, id) { write(KP(slug), read(KP(slug), []).filter((p) => p.id !== id)); },
      async setStock(slug, id, value) {
        const list = read(KP(slug), []); const p = list.find((x) => x.id === id); if (!p) return;
        p.stock = value === null ? null : Math.max(0, Math.floor(value)); write(KP(slug), list);
      },
      /* ---- pedidos ---- */
      async createOrder(slug, { type, customer, payment, note, items }) {
        const t = tenants().find((x) => x.slug === slug); checkOrderInput(t, type);
        if (!items || !items.length) throw new Error("Pedido vazio.");
        const products = read(KP(slug), []);
        const need = {}; const lines = [];
        for (const it of items) {
          const p = products.find((x) => x.id === it.id); const qty = Math.floor(it.qty);
          if (!p || !p.active || p.price == null || !(qty >= 1 && qty <= 200)) throw new Error("Item indisponível: " + (p ? p.name : it.id));
          const r = resolveLine(p, it.opts);
          need[p.id] = (need[p.id] || 0) + qty;
          lines.push({ p, qty, r, obs: String(it.obs || "").slice(0, 200) });
        }
        for (const [id, q] of Object.entries(need)) {
          const p = products.find((x) => x.id === id);
          if (p.stock != null && p.stock < q) throw new Error(`Estoque insuficiente de "${p.name}" (restam ${p.stock}).`);
        }
        const subtotal = money(lines.reduce((s, l) => s + l.r.unit * l.qty, 0));
        if (subtotal < (t.settings.minOrder || 0)) throw new Error(`Pedido mínimo: R$ ${String(t.settings.minOrder).replace(".", ",")}.`);
        Object.entries(need).forEach(([id, q]) => { const p = products.find((x) => x.id === id); if (p.stock != null) p.stock -= q; });
        const fee = type === "entrega" ? money(t.settings.deliveryFee || 0) : 0;
        const orders = read(KO(slug), []);
        let code; do { code = genCode(); } while (orders.some((o) => o.code === code));
        const order = {
          id: "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), code, createdAt: new Date().toISOString(),
          status: "novo", type, customer, payment, note: String(note || "").slice(0, 300),
          items: lines.map((l) => ({ id: l.p.id, name: l.p.name, price: l.r.unit, qty: l.qty, opts: l.r.labels, obs: l.obs })),
          subtotal, fee, total: money(subtotal + fee)
        };
        orders.push(order); write(KP(slug), products); write(KO(slug), orders);
        return { code: order.code, id: order.id };
      },
      async getOrderByCode(slug, code) { return read(KO(slug), []).find((o) => o.code === String(code).toUpperCase()) || null; },
      async listOrders(slug) { return read(KO(slug), []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
      async setOrderStatus(slug, id, status) {
        const orders = read(KO(slug), []); const o = orders.find((x) => x.id === id); if (!o) return;
        if (status === "cancelado" && o.status !== "cancelado") {
          const products = read(KP(slug), []);
          o.items.forEach((it) => { const p = products.find((x) => x.id === it.id); if (p && p.stock != null) p.stock += it.qty; });
          write(KP(slug), products);
        }
        o.status = status; write(KO(slug), orders);
      },
      async resetDemo() {
        Object.keys(localStorage).filter((k) => k.startsWith("lm_")).forEach((k) => localStorage.removeItem(k));
        await this.init();
      },
      /* ---- acesso ---- */
      auth: {
        async login(kind, slug, creds) {
          if (kind === "agency") {
            if (String(creds.pin) !== String(CFG.agency.localPin)) throw new Error("PIN incorreto.");
            localStorage.setItem(SA, "1"); return;
          }
          const t = tenants().find((x) => x.slug === slug);
          if (!t) throw new Error("Loja não encontrada. Confira o endereço da loja.");
          if (String(creds.pin) !== String(t.pin)) throw new Error("PIN incorreto.");
          localStorage.setItem(SO(slug), "1");
        },
        async status() {
          const agency = localStorage.getItem(SA) === "1";
          const slugs = tenants().map((t) => t.slug).filter((s) => localStorage.getItem(SO(s)) === "1");
          return { agency, slugs };
        },
        async can(slug) { const s = await this.status(); return s.agency || s.slugs.includes(slug); },
        logout() { localStorage.removeItem(SA); tenants().forEach((t) => localStorage.removeItem(SO(t.slug))); }
      },
      watch(cb, ms = 4000) {
        window.addEventListener("storage", (e) => { if (e.key && e.key.startsWith("lm_")) cb(); });
        return setInterval(cb, ms);
      }
    };
  })();

  /* ============================= SUPABASE ============================= */
  const Remote = (() => {
    const { url, anonKey } = CFG.supabase;
    const TK = "lm_sb_token", RK = "lm_sb_role";
    const token = () => localStorage.getItem(TK);
    async function api(path, { method = "GET", body, auth = false, prefer } = {}) {
      const res = await fetch(url + path, {
        method,
        headers: { apikey: anonKey, Authorization: "Bearer " + (auth && token() ? token() : anonKey), "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
      const txt = await res.text(); let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
      if (!res.ok) throw new Error(String((data && (data.message || data.error_description || data.msg)) || "Erro de conexão (" + res.status + ")").replace(/^ERRO:\s*/, ""));
      return data;
    }
    const q = encodeURIComponent;
    const tFrom = (r) => ({ slug: r.slug, name: r.name, tagline: r.tagline || "", logo: r.logo || "", cover: r.cover || "", theme: r.theme || {}, info: { ...DEFAULT_INFO, ...(r.info || {}) }, settings: { ...DEFAULT_SETTINGS, ...(r.settings || {}) }, categories: r.categories || [], active: r.active });
    const tRow = (t) => ({ slug: t.slug, name: t.name, tagline: t.tagline, logo: t.logo, cover: t.cover, theme: t.theme, info: t.info, settings: t.settings, categories: t.categories, active: t.active });
    const pFrom = (r) => ({ id: r.id, category: r.category, name: r.name, desc: r.description || "", price: r.price == null ? null : Number(r.price), stock: r.stock, lowAt: r.low_at, active: r.active, img: r.img || "", tag: r.tag || "", options: r.options || [] });
    const pRow = (slug, p, i) => ({ tenant: slug, id: p.id, category: p.category, name: p.name, description: p.desc || "", price: p.price, stock: p.stock, low_at: p.lowAt ?? 5, active: p.active !== false, img: p.img || "", tag: p.tag || "", options: p.options || [], ...(i != null ? { sort: i } : {}) });
    const oFrom = (r) => ({ id: r.id, code: r.code, createdAt: r.created_at, status: r.status, type: r.type, customer: r.customer, payment: r.payment, note: r.note, items: r.items, subtotal: Number(r.subtotal), fee: Number(r.fee), total: Number(r.total) });

    return {
      mode: "supabase",
      async init() {},
      async listTenants() {
        const [rows, bill] = await Promise.all([api("/rest/v1/tenants?select=*&order=created_at.asc", { auth: true }), api("/rest/v1/tenant_billing?select=*", { auth: true }).catch(() => [])]);
        return rows.map((r) => { const b = bill.find((x) => x.slug === r.slug) || {}; return { ...tFrom(r), billing: { plan: b.plan || "", price: Number(b.price || 0), since: b.since || "", notes: b.notes || "" } }; });
      },
      async listPublicTenants() { return (await api("/rest/v1/tenants?select=*&active=eq.true&order=created_at.asc")).map(tFrom); },
      async getTenant(slug) { const r = await api("/rest/v1/tenants?select=*&slug=eq." + q(slug)); return r[0] ? tFrom(r[0]) : null; },
      async getTenantFull(slug) { const t = await this.getTenant(slug); return t; },
      async saveTenant(slug, patch) {
        const cur = await this.getTenant(slug); if (!cur) throw new Error("Loja não encontrada.");
        const next = { ...cur };
        for (const k of Object.keys(patch)) { if (["settings", "info", "theme"].includes(k)) next[k] = { ...(cur[k] || {}), ...patch[k] }; else if (k !== "billing" && k !== "pin") next[k] = patch[k]; }
        await api("/rest/v1/tenants?slug=eq." + q(slug), { method: "PATCH", auth: true, body: tRow(next) });
        if (patch.billing) await api("/rest/v1/tenant_billing", { method: "POST", auth: true, prefer: "resolution=merge-duplicates", body: { slug, ...patch.billing } });
        return next;
      },
      async createTenant(t) {
        const row = tRow({ slug: t.slug, name: t.name, tagline: t.tagline || "", logo: t.logo || "", cover: t.cover || "", theme: { primary: "#5b3df5", accent: "#ffb703", ...(t.theme || {}) }, info: { ...DEFAULT_INFO, ...(t.info || {}) }, settings: { ...DEFAULT_SETTINGS, ...(t.settings || {}) }, categories: t.categories || clone(window.LM_DEFAULT_CATEGORIES), active: true });
        await api("/rest/v1/tenants", { method: "POST", auth: true, body: row });
        await api("/rest/v1/tenant_billing", { method: "POST", auth: true, prefer: "resolution=merge-duplicates", body: { slug: t.slug, ...(t.billing || { plan: "Mensal", price: 0 }) } });
        return row;
      },
      async deleteTenant(slug) { await api("/rest/v1/tenants?slug=eq." + q(slug), { method: "DELETE", auth: true }); },
      async getProducts(slug) { return (await api("/rest/v1/products?select=*&tenant=eq." + q(slug) + "&order=sort.asc,name.asc")).map(pFrom); },
      async saveProduct(slug, p) {
        if (!p.id) p.id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
        await api("/rest/v1/products", { method: "POST", auth: true, body: pRow(slug, p), prefer: "resolution=merge-duplicates" }); return p;
      },
      async deleteProduct(slug, id) { await api("/rest/v1/products?tenant=eq." + q(slug) + "&id=eq." + q(id), { method: "DELETE", auth: true }); },
      async setStock(slug, id, v) {
        await api("/rest/v1/products?tenant=eq." + q(slug) + "&id=eq." + q(id), { method: "PATCH", auth: true, body: { stock: v === null ? null : Math.max(0, Math.floor(v)) } });
      },
      async createOrder(slug, payload) {
        const r = await api("/rest/v1/rpc/create_order", { method: "POST", body: { p_slug: slug, payload } }); return { code: r.code, id: r.id };
      },
      async getOrderByCode(slug, code) {
        const r = await api("/rest/v1/rpc/get_order", { method: "POST", body: { p_slug: slug, p_code: String(code).toUpperCase() } }); return r ? oFrom(r) : null;
      },
      async listOrders(slug) { return (await api("/rest/v1/orders?select=*&tenant=eq." + q(slug) + "&order=created_at.desc&limit=300", { auth: true })).map(oFrom); },
      async setOrderStatus(slug, id, status) { await api("/rest/v1/rpc/set_order_status", { method: "POST", auth: true, body: { p_slug: slug, p_id: id, p_status: status } }); },
      async resetDemo() {},
      auth: {
        async login(kind, slug, { email, password }) {
          const r = await api("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
          localStorage.setItem(TK, r.access_token);
          const role = await api("/rest/v1/rpc/my_role", { method: "POST", auth: true, body: {} });
          localStorage.setItem(RK, JSON.stringify(role));
          if (kind === "agency" && !role.agency) { this.logout(); throw new Error("Esta conta não é da agência."); }
          if (kind === "owner" && !role.agency && !(role.slugs || []).includes(slug)) { this.logout(); throw new Error("Esta conta não tem acesso a esta loja."); }
        },
        async status() { if (!token()) return { agency: false, slugs: [] }; try { return JSON.parse(localStorage.getItem(RK)) || { agency: false, slugs: [] }; } catch { return { agency: false, slugs: [] }; } },
        async can(slug) { const s = await this.status(); return s.agency || (s.slugs || []).includes(slug); },
        logout() { localStorage.removeItem(TK); localStorage.removeItem(RK); }
      },
      watch(cb, ms = 6000) { return setInterval(cb, ms); }
    };
  })();

  const useRemote = CFG.mode === "supabase" && CFG.supabase.url && CFG.supabase.anonKey;
  window.Store = Object.assign(useRemote ? Remote : Local, { STATUS, DEFAULT_SETTINGS });
})();
