/* ============================================================
   Painel da agência Lua Menu: lojas contratantes, contratos e acesso
   ============================================================ */
(function () {
  const { $, $$, fmt, toast, slugify } = window.LM;
  const { brl, esc } = fmt;
  const S = { tenants: [], stats: {}, sheet: null, delConfirm: null };
  const num = (v) => { const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };

  async function boot() {
    await Store.init();
    const remote = Store.mode === "supabase";
    $("#localFields").hidden = remote; $("#remoteFields").hidden = !remote;
    if (!remote) { $("#demoHint").hidden = false; $("#demoHint").textContent = "Modo demonstração: PIN " + window.LM_CONFIG.agency.localPin + "."; $("#resetBtn").hidden = false; }
    if ((await Store.auth.status()).agency) return start();
    $("#login").hidden = false;
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target).entries());
    try { await Store.auth.login("agency", null, d); $("#login").hidden = true; await start(); }
    catch (err) { $("#loginErr").innerHTML = `<div class="alert">${esc(err.message)}</div>`; }
  });
  $("#logout").addEventListener("click", () => { Store.auth.logout(); location.href = "agencia.html"; });
  $("#resetBtn").addEventListener("click", async () => { if (!S.resetArmed) { S.resetArmed = true; $("#resetBtn").textContent = "Toque de novo para apagar tudo"; return; } await Store.resetDemo(); Store.auth.logout(); location.href = "agencia.html"; });

  async function start() { $("#app").hidden = false; await load(); render(); Store.watch(async () => { if (!S.sheet) { await load(); render(); } }, 8000); }
  async function load() {
    S.tenants = await Store.listTenants();
    const today = new Date().toDateString();
    await Promise.all(S.tenants.map(async (t) => {
      try {
        const os = await Store.listOrders(t.slug); const td = os.filter((o) => new Date(o.createdAt).toDateString() === today && o.status !== "cancelado");
        S.stats[t.slug] = { total: os.length, today: td.length, revenue: td.reduce((s, o) => s + o.total, 0), pending: os.filter((o) => o.status === "novo").length };
      } catch { S.stats[t.slug] = { total: 0, today: 0, revenue: 0, pending: 0 }; }
    }));
  }

  function render() {
    const act = S.tenants.filter((t) => t.active);
    const mrr = act.reduce((s, t) => s + Number(t.billing?.price || 0), 0);
    const st = Object.values(S.stats);
    $("#page").innerHTML = `
      <div class="kpis">
        <div class="kpi"><small>Lojas ativas</small><b>${act.length}<span class="hint"> / ${S.tenants.length}</span></b></div>
        <div class="kpi"><small>Mensalidades ativas</small><b>${brl(mrr)}</b></div>
        <div class="kpi"><small>Pedidos hoje (todas)</small><b>${st.reduce((s, x) => s + x.today, 0)}</b></div>
        <div class="kpi"><small>Vendas hoje (todas)</small><b>${brl(st.reduce((s, x) => s + x.revenue, 0))}</b></div>
      </div>
      <h2 class="h2">Lojas</h2>
      ${S.tenants.length ? `<div class="tgrid">${S.tenants.map(card).join("")}</div>` : `<div class="empty">Nenhuma loja ainda. Toque em "+ Nova loja" para cadastrar a primeira lanchonete.</div>`}`;
  }
  function card(t) {
    const s = S.stats[t.slug] || {}; const b = t.billing || {};
    const url = new URL("loja.html?l=" + t.slug, location.href).href;
    return `<article class="tcard"><div class="tcard__h"><div class="av" style="${t.logo ? `background-image:url('${esc(t.logo)}')` : ""}"></div><div style="min-width:0"><b>${esc(t.name)}</b><small>/${esc(t.slug)}</small></div>
      <span class="pill ${t.active ? "pill--ok" : "pill--bad"}" style="margin-left:auto">${t.active ? "Ativa" : "Suspensa"}</span></div>
      <dl><dt>Plano</dt><dd>${esc(b.plan || "—")}</dd><dt>Mensalidade</dt><dd>${brl(b.price || 0)}</dd><dt>Cliente desde</dt><dd>${esc(b.since || "—")}</dd><dt>Pedidos hoje</dt><dd>${s.today ?? 0}${s.pending ? ` <span class="pill pill--bad">${s.pending} novo(s)</span>` : ""}</dd><dt>Vendas hoje</dt><dd>${brl(s.revenue || 0)}</dd></dl>
      ${b.notes ? `<div class="hint">${esc(b.notes)}</div>` : ""}
      <div class="tcard__act">
        <a class="btn btn--sm" href="painel.html?l=${esc(t.slug)}" target="_blank" rel="noopener">Abrir painel</a>
        <a class="btn btn--soft btn--sm" href="${esc(url)}" target="_blank" rel="noopener">Ver loja</a>
        <button class="btn btn--soft btn--sm" data-copy="${esc(url)}">Copiar link</button>
        <button class="btn btn--ghost btn--sm" data-edit="${esc(t.slug)}">Contrato</button>
        <button class="btn btn--ghost btn--sm" data-toggle="${esc(t.slug)}">${t.active ? "Suspender" : "Reativar"}</button>
      </div></article>`;
  }

  /* ---- nova loja ---- */
  function openSheet(title) { S.sheet = true; $("#sheetTitle").textContent = title; $("#sheet").hidden = false; $("#sheetBack").hidden = false; document.body.style.overflow = "hidden"; }
  function closeSheet() { S.sheet = null; S.delConfirm = null; $("#sheet").hidden = true; $("#sheetBack").hidden = true; document.body.style.overflow = ""; }

  function newStore() {
    openSheet("Nova loja");
    $("#sheetBody").innerHTML = `<form id="nform" novalidate><div id="nerr"></div>
      <div class="field"><label for="n-name">Nome da lanchonete</label><input id="n-name" name="name" autocomplete="off"></div>
      <div class="field"><label for="n-slug">Endereço do cardápio</label><input id="n-slug" name="slug" autocomplete="off" placeholder="nome-da-loja"><div class="hint" id="n-prev"></div></div>
      <div class="field"><label for="n-wa">WhatsApp da loja (com DDD)</label><input id="n-wa" name="whatsapp" inputmode="tel"></div>
      <div class="grid2"><div class="field"><label for="n-c1">Cor principal</label><input id="n-c1" name="primary" type="color" value="#d62839"></div>
      <div class="field"><label for="n-c2">Cor de destaque</label><input id="n-c2" name="accent" type="color" value="#ffb703"></div></div>
      <div class="grid2"><div class="field"><label for="n-plan">Plano</label><input id="n-plan" name="plan" value="Mensal"></div>
      <div class="field"><label for="n-price">Mensalidade (R$)</label><input id="n-price" name="price" inputmode="decimal" value="0"></div></div>
      ${Store.mode === "local" ? `<div class="field"><label for="n-pin">PIN do painel da loja</label><input id="n-pin" name="pin" inputmode="numeric" value="${String(Math.floor(1000 + Math.random() * 9000))}"></div>` : `<p class="note">O acesso do dono é por e-mail e senha: crie o usuário no Supabase e vincule à loja (veja o README).</p>`}
      <div class="field"><label for="n-copy">Começar com o cardápio de</label><select id="n-copy" name="copy"><option value="">Cardápio em branco (categorias padrão)</option>${S.tenants.map((t) => `<option value="${esc(t.slug)}">${esc(t.name)}</option>`).join("")}</select></div>
      <button class="btn btn--block" type="submit">Criar loja</button></form>`;
  }
  async function createStore(e) {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target).entries());
    const slug = slugify(d.slug || d.name);
    if (!d.name.trim() || !slug) { $("#nerr").innerHTML = `<div class="alert">Informe o nome da lanchonete.</div>`; return; }
    try {
      const src = d.copy ? S.tenants.find((t) => t.slug === d.copy) : null;
      await Store.createTenant({ slug, name: d.name.trim(), theme: { primary: d.primary, accent: d.accent }, info: { whatsapp: (d.whatsapp || "").replace(/\D/g, "") }, pin: d.pin, categories: src ? JSON.parse(JSON.stringify(src.categories)) : undefined, billing: { plan: d.plan || "Mensal", price: num(d.price), since: new Date().toISOString().slice(0, 10), notes: "" } });
      if (src) { const ps = await Store.getProducts(src.slug); for (const p of ps) await Store.saveProduct(slug, { ...p, stock: p.stock == null ? null : 0 }); }
      closeSheet(); await load(); render(); toast("Loja criada");
    } catch (err) { $("#nerr").innerHTML = `<div class="alert">${esc(err.message)}</div>`; }
  }

  /* ---- contrato ---- */
  function editContract(slug) {
    const t = S.tenants.find((x) => x.slug === slug); const b = t.billing || {}; S.cur = slug; openSheet("Contrato · " + t.name);
    $("#sheetBody").innerHTML = `<form id="cform" novalidate>
      <div class="grid2"><div class="field"><label for="c-plan">Plano</label><input id="c-plan" name="plan" value="${esc(b.plan || "")}"></div>
      <div class="field"><label for="c-price">Mensalidade (R$)</label><input id="c-price" name="price" inputmode="decimal" value="${String(b.price || 0).replace(".", ",")}"></div></div>
      <div class="field"><label for="c-notes">Anotações internas</label><textarea id="c-notes" name="notes" rows="3">${esc(b.notes || "")}</textarea></div>
      <button class="btn btn--block" type="submit">Salvar</button>
      <button class="btn btn--danger btn--block" style="margin-top:8px" type="button" id="delStore">Excluir loja e todos os pedidos</button></form>`;
  }

  document.addEventListener("click", async (e) => {
    const a = e.target.closest('a[href^="painel.html"]'); if (a) { try { window.LM.lsSet("lm_last_slug", new URL(a.href).searchParams.get("l")); } catch {} return; }
    const t = e.target.closest("button"); if (!t) return; const d = t.dataset;
    if (t.id === "newBtn") newStore();
    else if (t.id === "sheetClose") closeSheet();
    else if (d.edit) editContract(d.edit);
    else if (d.copy) navigator.clipboard?.writeText(d.copy).then(() => toast("Link copiado"), () => toast("Copie o link pela página da loja."));
    else if (d.toggle) { const x = S.tenants.find((y) => y.slug === d.toggle); await Store.saveTenant(x.slug, { active: !x.active }); await load(); render(); toast(x.active ? "Loja suspensa" : "Loja reativada"); }
    else if (t.id === "delStore") {
      if (S.delConfirm !== S.cur) { S.delConfirm = S.cur; t.textContent = "Toque de novo para excluir de vez"; return; }
      await Store.deleteTenant(S.cur); closeSheet(); await load(); render(); toast("Loja excluída");
    }
  });
  $("#sheetBack").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sheet) closeSheet(); });
  document.addEventListener("input", (e) => {
    if (e.target.id === "n-name" && !$("#n-slug").dataset.touched) $("#n-slug").value = slugify(e.target.value);
    if (e.target.id === "n-slug") e.target.dataset.touched = "1";
    if (e.target.id === "n-name" || e.target.id === "n-slug") { const p = $("#n-prev"); if (p) p.textContent = new URL("loja.html?l=" + (slugify($("#n-slug").value) || "..."), location.href).href; }
  });
  document.addEventListener("submit", async (e) => {
    if (e.target.id === "nform") createStore(e);
    else if (e.target.id === "cform") {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.target).entries());
      await Store.saveTenant(S.cur, { billing: { plan: d.plan, price: num(d.price), notes: d.notes } }); closeSheet(); await load(); render(); toast("Contrato salvo");
    }
  });
  boot().catch((e) => { console.error(e); $("#login").hidden = false; $("#loginErr").innerHTML = `<div class="alert">Não foi possível carregar.</div>`; });
})();
