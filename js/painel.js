/* ============================================================
   Painel da lanchonete: pedidos, estoque, cardápio, ajustes e divulgação
   URL: painel.html?l=<endereço-da-loja>
   ============================================================ */
(function () {
  const { $, $$, fmt, toast, lsGet, lsSet, slugify, parseOptions, optionsToText, fileToDataUrl } = window.LM;
  const { brl, esc } = fmt;
  const S = { slug: "", t: null, products: [], orders: [], tab: "pedidos", filter: "todos", q: "", known: null, sound: false, confirm: null, timer: null };
  const money = (v) => { v = String(v ?? "").trim(); if (!v) return null; const n = parseFloat(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isNaN(n) ? NaN : window.LM.money(n); };
  const catName = (id) => (S.t.categories.find((c) => c.id === id) || {}).name || "Sem categoria";

  /* ---------------- entrar ---------------- */
  const params = new URLSearchParams(location.search);
  async function boot() {
    await Store.init();
    const remote = Store.mode === "supabase";
    $("#localFields").hidden = remote; $("#remoteFields").hidden = !remote;
    const slug = (params.get("l") || lsGet("lm_last_slug", "") || "").toLowerCase();
    $("#l-slug").value = slug;
    if (!remote) { $("#demoHint").hidden = false; $("#demoHint").textContent = "Modo demonstração: loja me-gusta, PIN 1234."; }
    if (slug && (await Store.auth.can(slug))) return start(slug);
    $("#login").hidden = false;
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    const slug = slugify(d.slug);
    try {
      if (!slug) throw new Error("Informe o endereço da loja.");
      await Store.auth.login("owner", slug, { pin: d.pin, email: d.email, password: d.password });
      lsSet("lm_last_slug", slug); $("#login").hidden = true; await start(slug);
    } catch (err) { $("#loginErr").innerHTML = `<div class="alert">${esc(err.message)}</div>`; }
  });
  $("#logout").addEventListener("click", () => { Store.auth.logout(); clearInterval(S.timer); location.href = "painel.html"; });

  async function start(slug) {
    S.slug = slug;
    S.t = Store.mode === "local" ? await Store.getTenantFull(slug) : await Store.getTenant(slug);
    if (!S.t) { $("#login").hidden = false; $("#loginErr").innerHTML = `<div class="alert">Loja não encontrada.</div>`; return; }
    window.LM.applyTheme(S.t);
    $("#app").hidden = false;
    $("#tName").textContent = S.t.name; $("#tSub").textContent = "Painel da loja";
    $("#tAv").style.backgroundImage = S.t.logo ? `url("${S.t.logo}")` : "none"; $("#tAv").style.backgroundSize = "cover";
    $("#viewLink").href = "loja.html?l=" + slug;
    document.title = "Painel · " + S.t.name;
    await load(); S.known = new Set(S.orders.map((o) => o.id));
    renderAll();
    S.timer = Store.watch(poll, Store.mode === "local" ? 3000 : 6000);
  }
  async function load() {
    [S.products, S.orders] = await Promise.all([Store.getProducts(S.slug), Store.listOrders(S.slug)]);
  }
  async function poll() {
    if (S.sheet) return;
    const focused = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $("#page").contains(document.activeElement);
    try { await load(); } catch { return; }
    const fresh = S.orders.filter((o) => !S.known.has(o.id));
    if (fresh.length) { fresh.forEach((o) => S.known.add(o.id)); beep(); toast(`Novo pedido ${fresh[0].code}`); }
    updateBadge();
    if (!focused && (S.tab === "pedidos" || S.tab === "estoque")) renderTab();
  }
  function updateBadge() {
    const n = S.orders.filter((o) => o.status === "novo").length;
    $("#newBadge").hidden = n === 0; $("#newBadge").textContent = n;
  }
  function renderAll() {
    $("#openSw").checked = !!S.t.settings.open; $("#openLbl").textContent = S.t.settings.open ? "Loja aberta" : "Loja fechada";
    updateBadge(); renderTab();
  }
  function renderTab() {
    $$(".ptab").forEach((b) => b.classList.toggle("is-on", b.dataset.tab === S.tab));
    ({ pedidos: tabPedidos, estoque: tabEstoque, cardapio: tabCardapio, ajustes: tabAjustes, divulgar: tabDivulgar })[S.tab]();
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest(".ptab"); if (b) { S.tab = b.dataset.tab; S.confirm = null; renderTab(); window.scrollTo(0, 0); } });
  $("#openSw").addEventListener("change", async (e) => {
    try { await Store.saveTenant(S.slug, { settings: { open: e.target.checked } }); S.t.settings.open = e.target.checked; renderAll(); toast(e.target.checked ? "Loja aberta para pedidos" : "Loja fechada para pedidos"); }
    catch (err) { toast(err.message, "bad"); e.target.checked = !e.target.checked; }
  });

  /* ---------------- som ---------------- */
  let actx;
  function beep() {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((d, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = i ? 988 : 784; o.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(0.18, actx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + d + 0.16); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + 0.17); });
    } catch {}
  }

  /* ============================ PEDIDOS ============================ */
  const NEXT = { novo: ["preparando", "Aceitar e preparar"], preparando: ["pronto", "Marcar como pronto"] };
  function orderCard(o) {
    const next = o.status === "pronto" ? ["entregue", o.type === "entrega" ? "Saiu / entregue" : "Retirado pelo cliente"] : NEXT[o.status];
    const wa = String(o.customer?.phone || "").replace(/\D/g, "");
    const cancelling = S.confirm === o.id;
    return `<article class="ord ord--${o.status}">
      <div class="ord__h"><span class="ord__code">${esc(o.code)}</span><span class="ord__t">${fmt.time(o.createdAt)}</span></div>
      <div class="ord__who">${esc(o.customer?.name || "")} <span class="pill ${o.type === "entrega" ? "pill--info" : ""}">${o.type === "entrega" ? "Entrega" : "Retirada"}</span></div>
      <div class="ord__meta">${esc(fmt.phone(wa))} · ${esc(o.payment || "")}${o.type === "entrega" && o.customer?.address ? `<br>${esc(o.customer.address)}${o.customer.neighborhood ? " · " + esc(o.customer.neighborhood) : ""}` : ""}</div>
      <ul>${o.items.map((i) => `<li><b>${i.qty}×</b> ${esc(i.name)}${(i.opts && i.opts.length) || i.obs ? `<small>${esc([...(i.opts || []), i.obs ? "Obs.: " + i.obs : ""].filter(Boolean).join(" · "))}</small>` : ""}</li>`).join("")}</ul>
      ${o.note ? `<div class="note">Obs.: ${esc(o.note)}</div>` : ""}
      <div class="ord__tot"><span>${o.fee ? "Total com entrega" : "Total"}</span><span class="tabular">${brl(o.total)}</span></div>
      <div class="ord__act">
        ${next ? `<button class="btn btn--sm" data-st="${o.id}|${next[0]}">${next[1]}</button>` : ""}
        ${wa ? `<a class="btn btn--soft btn--sm" target="_blank" rel="noopener" href="https://wa.me/55${wa}">WhatsApp</a>` : ""}
        <button class="btn btn--soft btn--sm" data-print="${o.id}">Imprimir</button>
        ${["novo", "preparando", "pronto"].includes(o.status) ? (cancelling ? `<button class="btn btn--danger btn--sm" data-st="${o.id}|cancelado">Confirmar cancelamento</button>` : `<button class="btn btn--ghost btn--sm" data-cancel="${o.id}">Cancelar</button>`) : ""}
      </div></article>`;
  }
  function tabPedidos() {
    const today = new Date().toDateString();
    const td = S.orders.filter((o) => new Date(o.createdAt).toDateString() === today && o.status !== "cancelado");
    const rev = td.reduce((s, o) => s + o.total, 0);
    const active = (st) => S.orders.filter((o) => o.status === st).slice().reverse();
    const done = S.orders.filter((o) => (o.status === "entregue" || o.status === "cancelado") && new Date(o.createdAt).toDateString() === today);
    const col = (st, title) => `<section class="col"><h3><span>${title}</span><span>${active(st).length}</span></h3>${active(st).map(orderCard).join("") || `<div class="empty">Nenhum pedido</div>`}</section>`;
    $("#page").innerHTML = `
      <div class="kpis">
        <div class="kpi"><small>Pedidos hoje</small><b>${td.length}</b></div>
        <div class="kpi"><small>Faturamento hoje</small><b>${brl(rev)}</b></div>
        <div class="kpi"><small>Ticket médio</small><b>${td.length ? brl(rev / td.length) : "—"}</b></div>
        <div class="kpi ${S.orders.filter((o) => o.status === "novo").length ? "kpi--bad" : ""}"><small>Aguardando aceite</small><b>${S.orders.filter((o) => o.status === "novo").length}</b></div>
      </div>
      <div class="tools"><button class="chipf ${S.sound ? "is-on" : ""}" id="soundBtn" type="button">🔔 Aviso sonoro: ${S.sound ? "ligado" : "desligado"}</button><span class="hint">A lista atualiza sozinha.</span></div>
      <div class="cols">${col("novo", "Novos")}${col("preparando", "Em preparo")}${col("pronto", "Prontos")}</div>
      <h2 class="h2">Concluídos e cancelados hoje</h2>
      ${done.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Código</th><th>Hora</th><th>Cliente</th><th>Tipo</th><th>Total</th><th>Situação</th></tr></thead><tbody>${done.map((o) => `<tr><td class="name">${esc(o.code)}</td><td>${fmt.time(o.createdAt)}</td><td>${esc(o.customer?.name || "")}</td><td>${o.type === "entrega" ? "Entrega" : "Retirada"}</td><td class="n">${brl(o.total)}</td><td><span class="pill ${o.status === "cancelado" ? "pill--bad" : "pill--ok"}">${fmt.statusLabel[o.status]}</span></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nada concluído ainda hoje.</div>`}`;
  }
  async function setStatus(id, st) {
    try { await Store.setOrderStatus(S.slug, id, st); S.confirm = null; await load(); updateBadge(); renderTab(); }
    catch (e) { toast(e.message, "bad"); }
  }
  function printOrder(id) {
    const o = S.orders.find((x) => x.id === id); if (!o) return;
    $("#ticket").innerHTML = `<div style="text-align:center"><b>${esc(S.t.name)}</b><br>Pedido ${esc(o.code)} · ${fmt.dateTime(o.createdAt)}</div><hr>
      ${esc(o.customer?.name || "")} · ${esc(fmt.phone(o.customer?.phone))}<br>${o.type === "entrega" ? "ENTREGA: " + esc(o.customer?.address || "") + " " + esc(o.customer?.neighborhood || "") : "RETIRADA"}<hr>
      ${o.items.map((i) => `${i.qty}x ${esc(i.name)}  ${brl(i.price * i.qty)}${i.opts?.length ? "<br>&nbsp;&nbsp;" + esc(i.opts.join(", ")) : ""}${i.obs ? "<br>&nbsp;&nbsp;Obs: " + esc(i.obs) : ""}`).join("<br>")}<hr>
      ${o.fee ? "Entrega: " + brl(o.fee) + "<br>" : ""}<b>TOTAL: ${brl(o.total)}</b><br>Pagamento: ${esc(o.payment || "")}${o.note ? "<br>Obs: " + esc(o.note) : ""}`;
    window.print();
  }

  /* ============================ ESTOQUE ============================ */
  const stState = (p) => p.stock == null ? "free" : p.stock === 0 ? "out" : p.stock <= (p.lowAt ?? 5) ? "low" : "ok";
  function tabEstoque() {
    const all = S.products;
    const cnt = (s) => all.filter((p) => stState(p) === s).length;
    const q = S.q.trim().toLowerCase();
    const list = all.filter((p) => (S.filter === "todos" || (S.filter === "baixo" && stState(p) === "low") || (S.filter === "esgotado" && stState(p) === "out") || (S.filter === "livre" && stState(p) === "free")) && (!q || p.name.toLowerCase().includes(q)));
    const F = (k, l) => `<button class="chipf ${S.filter === k ? "is-on" : ""}" data-filter="${k}">${l}</button>`;
    const pillFor = (p) => ({ free: `<span class="pill">Sem controle</span>`, out: `<span class="pill pill--bad">Esgotado</span>`, low: `<span class="pill pill--warn">Estoque baixo</span>`, ok: `<span class="pill pill--ok">Em estoque</span>` })[stState(p)];
    const units = all.filter((p) => p.stock != null).reduce((s, p) => s + p.stock, 0);
    $("#page").innerHTML = `
      <div class="kpis">
        <div class="kpi"><small>Itens com controle</small><b>${all.filter((p) => p.stock != null).length}<span class="hint"> / ${all.length}</span></b></div>
        <div class="kpi"><small>Unidades em estoque</small><b>${units}</b></div>
        <div class="kpi ${cnt("low") ? "kpi--warn" : ""}"><small>Estoque baixo</small><b>${cnt("low")}</b></div>
        <div class="kpi ${cnt("out") ? "kpi--bad" : ""}"><small>Esgotados</small><b>${cnt("out")}</b></div>
      </div>
      <p class="note">O estoque desce sozinho a cada pedido e volta se o pedido for cancelado. Item esgotado some das opções de compra no site. Deixe o campo vazio para não controlar o estoque de um item.</p>
      <div class="tools" style="margin-top:12px">${F("todos", "Todos")}${F("baixo", "Estoque baixo")}${F("esgotado", "Esgotados")}${F("livre", "Sem controle")}
        <input class="inp" id="stq" type="search" placeholder="Buscar item" value="${esc(S.q)}" aria-label="Buscar item"></div>
      ${list.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Item</th><th>Situação</th><th>Quantidade</th><th>Alerta em</th></tr></thead><tbody>
      ${list.map((p) => { const pct = p.stock == null ? 0 : Math.min(100, (p.stock / Math.max(p.lowAt * 4, 20)) * 100); return `<tr>
        <td><div class="name">${esc(p.name)}${p.active ? "" : ' <span class="pill">Oculto</span>'}</div><div class="sub">${esc(catName(p.category))}${p.price == null ? " · sem preço" : ""}</div></td>
        <td>${pillFor(p)}${p.stock != null ? `<div class="bar2"><i class="${stState(p) === "low" ? "low" : stState(p) === "out" ? "out" : ""}" style="width:${pct}%"></i></div>` : ""}</td>
        <td><span class="stk"><button data-sd="${p.id}" aria-label="Diminuir ${esc(p.name)}">−</button><input type="number" min="0" inputmode="numeric" data-stock="${p.id}" value="${p.stock ?? ""}" placeholder="—" aria-label="Quantidade de ${esc(p.name)}"><button data-si="${p.id}" aria-label="Aumentar ${esc(p.name)}">+</button></span></td>
        <td class="n">${p.stock == null ? "—" : (p.lowAt ?? 5) + " un."}</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">Nenhum item neste filtro.</div>`}`;
  }
  async function setStock(id, v) {
    const p = S.products.find((x) => x.id === id); if (!p) return;
    try { await Store.setStock(S.slug, id, v); p.stock = v; } catch (e) { toast(e.message, "bad"); }
    tabEstoque();
  }

  /* ============================ CARDÁPIO ============================ */
  function tabCardapio() {
    const cats = S.t.categories;
    $("#page").innerHTML = `
      <div class="h2"><span>Produtos</span><span class="grow"></span><button class="btn btn--sm" data-newp>+ Novo produto</button></div>
      ${cats.map((c) => { const ps = S.products.filter((p) => p.category === c.id); return ps.length ? `<div class="panel"><h3>${esc(c.name)} <span class="hint">(${ps.length})</span></h3>${ps.map(prodRow).join("")}</div>` : ""; }).join("")}
      ${(() => { const orphan = S.products.filter((p) => !cats.some((c) => c.id === p.category)); return orphan.length ? `<div class="panel"><h3>Sem categoria</h3>${orphan.map(prodRow).join("")}</div>` : ""; })()}
      <div class="h2"><span>Categorias</span></div>
      <div class="panel">
        ${cats.map((c, i) => `<div class="cat-row"><input class="inp" data-catname="${esc(c.id)}" value="${esc(c.name)}" aria-label="Nome da categoria"><button class="btn btn--soft btn--sm" data-catup="${i}" ${i === 0 ? "disabled" : ""} aria-label="Subir">↑</button><button class="btn btn--soft btn--sm" data-catdn="${i}" ${i === cats.length - 1 ? "disabled" : ""} aria-label="Descer">↓</button><button class="btn btn--ghost btn--sm" data-catdel="${esc(c.id)}">Remover</button></div>`).join("")}
        <div class="cat-row"><input class="inp" id="newCat" placeholder="Nova categoria (ex.: Porções)"><button class="btn btn--sm" id="addCat">Adicionar</button></div>
      </div>`;
  }
  function prodRow(p) {
    return `<div class="prow ${p.active ? "" : "off"}"><div class="th" style="${p.img ? `background-image:url('${esc(p.img)}')` : ""}"></div>
      <div class="tx"><b>${esc(p.name)}</b><small>${p.price == null ? "Sem preço" : brl(p.price)} · ${p.stock == null ? "estoque livre" : p.stock + " un."}${p.active ? "" : " · oculto"}</small></div>
      <button class="btn btn--soft btn--sm" data-editp="${p.id}">Editar</button></div>`;
  }
  async function saveCats(cats) { await Store.saveTenant(S.slug, { categories: cats }); S.t.categories = cats; tabCardapio(); }

  function editProduct(id) {
    const isNew = !id; const p = isNew ? { id: "", category: S.t.categories[0]?.id || "", name: "", desc: "", price: null, stock: null, lowAt: 5, active: true, img: "", tag: "", options: [] } : { ...S.products.find((x) => x.id === id) };
    S.sheet = "prod"; S.editing = p; S.delConfirm = false;
    $("#sheetTitle").textContent = isNew ? "Novo produto" : "Editar produto";
    $("#sheetBody").innerHTML = `<form id="pform" novalidate>
      <div id="perr"></div>
      <div class="field"><label for="p-name">Nome</label><input id="p-name" name="name" value="${esc(p.name)}"></div>
      <div class="field"><label for="p-cat">Categoria</label><select id="p-cat" name="category">${S.t.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === p.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="p-desc">Descrição</label><textarea id="p-desc" name="desc" rows="2">${esc(p.desc)}</textarea></div>
      <div class="grid2">
        <div class="field"><label for="p-price">Preço (R$)</label><input id="p-price" name="price" inputmode="decimal" placeholder="Vazio = sob consulta" value="${p.price == null ? "" : String(p.price).replace(".", ",")}"></div>
        <div class="field"><label for="p-stock">Estoque (un.)</label><input id="p-stock" name="stock" type="number" min="0" placeholder="Vazio = sem controle" value="${p.stock ?? ""}"></div>
        <div class="field"><label for="p-low">Avisar estoque baixo em</label><input id="p-low" name="lowAt" type="number" min="0" value="${p.lowAt ?? 5}"></div>
        <div class="field"><label for="p-tag">Selo (opcional)</label><input id="p-tag" name="tag" placeholder="Ex.: Novidade" value="${esc(p.tag || "")}"></div>
      </div>
      <div class="field"><span class="lbl">Foto</span><div class="imgpick"><div class="pv" id="pPv" style="${p.img ? `background-image:url('${esc(p.img)}')` : ""}"></div>
        <div><input type="file" id="p-img" accept="image/*" aria-label="Enviar foto"><br><button type="button" class="btn btn--ghost btn--sm" id="p-imgrm" style="margin-top:6px">Remover foto</button></div></div></div>
      <div class="field"><label for="p-opts">Opções para o cliente escolher (opcional)</label><textarea id="p-opts" name="options" rows="3" placeholder="* Preparo: Com água; Com leite&#10;Adicionais: Bacon (+3,00); Cheddar (+2,50)">${esc(optionsToText(p.options))}</textarea>
        <div class="hint">Uma linha por grupo. Comece com * para escolha obrigatória. Preço extra entre parênteses.</div></div>
      <label class="sw" style="margin:6px 0 14px"><input type="checkbox" name="active" ${p.active ? "checked" : ""}><i></i><span>Visível no cardápio</span></label>
      <button class="btn btn--block" type="submit">Salvar produto</button>
      ${isNew ? "" : `<button class="btn btn--danger btn--block" style="margin-top:8px" type="button" id="p-del">Excluir produto</button>`}
    </form>`;
    $("#sheet").hidden = false; $("#sheetBack").hidden = false; document.body.style.overflow = "hidden";
  }
  function closeSheet() { S.sheet = null; $("#sheet").hidden = true; $("#sheetBack").hidden = true; document.body.style.overflow = ""; }
  async function submitProduct(e) {
    e.preventDefault(); const f = e.target; const d = Object.fromEntries(new FormData(f).entries()); const p = S.editing;
    const price = money(d.price), stock = d.stock === "" ? null : Math.max(0, Math.floor(Number(d.stock)));
    const err = !d.name.trim() ? "Informe o nome do produto." : Number.isNaN(price) ? "Preço inválido." : !d.category ? "Crie uma categoria antes de cadastrar produtos." : null;
    if (err) { $("#perr").innerHTML = `<div class="alert">${err}</div>`; return; }
    Object.assign(p, { name: d.name.trim(), category: d.category, desc: d.desc.trim(), price, stock, lowAt: Math.max(0, Math.floor(Number(d.lowAt) || 0)), tag: d.tag.trim(), options: parseOptions(d.options), active: !!d.active });
    try { await Store.saveProduct(S.slug, p); await load(); closeSheet(); renderTab(); toast("Produto salvo"); } catch (er) { $("#perr").innerHTML = `<div class="alert">${esc(er.message)}</div>`; }
  }

  /* ============================ AJUSTES ============================ */
  function tabAjustes() {
    const t = S.t, st = t.settings, i = t.info, th = t.theme || {};
    $("#page").innerHTML = `<form id="sform" novalidate>
      <div class="panel"><h3>Identidade</h3>
        <div class="grid2"><div class="field"><label for="s-name">Nome da loja</label><input id="s-name" name="name" value="${esc(t.name)}"></div>
        <div class="field"><label for="s-tag">Frase curta</label><input id="s-tag" name="tagline" value="${esc(t.tagline)}"></div>
        <div class="field"><label for="s-c1">Cor principal</label><input id="s-c1" name="primary" type="color" value="${esc(th.primary || "#3b2bd6")}"></div>
        <div class="field"><label for="s-c2">Cor de destaque</label><input id="s-c2" name="accent" type="color" value="${esc(th.accent || "#ffb703")}"></div></div>
        <div class="field"><span class="lbl">Logo (quadrada)</span><div class="imgpick"><div class="pv" id="logoPv" style="${t.logo ? `background-image:url('${esc(t.logo)}')` : ""}"></div><input type="file" id="s-logo" accept="image/*" aria-label="Enviar logo"></div></div>
        <div class="field"><span class="lbl">Capa (faixa larga)</span><div class="imgpick"><div class="pv wide" id="coverPv" style="${t.cover ? `background-image:url('${esc(t.cover)}')` : ""}"></div><input type="file" id="s-cover" accept="image/*" aria-label="Enviar capa"></div></div>
      </div>
      <div class="panel"><h3>Contato e funcionamento</h3>
        <div class="grid2"><div class="field"><label for="s-wa">WhatsApp da loja</label><input id="s-wa" name="whatsapp" inputmode="tel" placeholder="Somente números, com DDD" value="${esc(i.whatsapp)}"></div>
        <div class="field"><label for="s-addr">Endereço</label><input id="s-addr" name="address" value="${esc(i.address)}"></div></div>
        <div class="field"><label for="s-hours">Horário de funcionamento</label><textarea id="s-hours" name="hours" rows="2" placeholder="Ex.: Seg a sáb, 18h às 23h">${esc(i.hours)}</textarea></div>
        <div class="field"><label for="s-pay">Formas de pagamento (separe por vírgula)</label><input id="s-pay" name="payments" value="${esc((i.payments || []).join(", "))}"></div>
      </div>
      <div class="panel"><h3>Pedidos</h3>
        <label class="sw" style="margin-bottom:8px"><input type="checkbox" name="pickupEnabled" ${st.pickupEnabled ? "checked" : ""}><i></i><span>Aceitar retirada</span></label><br>
        <label class="sw"><input type="checkbox" name="deliveryEnabled" ${st.deliveryEnabled ? "checked" : ""}><i></i><span>Aceitar entrega</span></label>
        <div class="grid2" style="margin-top:12px"><div class="field"><label for="s-fee">Taxa de entrega (R$)</label><input id="s-fee" name="deliveryFee" inputmode="decimal" value="${String(st.deliveryFee || 0).replace(".", ",")}"></div>
        <div class="field"><label for="s-min">Pedido mínimo (R$)</label><input id="s-min" name="minOrder" inputmode="decimal" value="${String(st.minOrder || 0).replace(".", ",")}"></div>
        <div class="field"><label for="s-prep">Tempo médio de preparo (min)</label><input id="s-prep" name="avgPrepMinutes" type="number" min="0" value="${st.avgPrepMinutes || 0}"></div></div>
      </div>
      ${Store.mode === "local" ? `<div class="panel"><h3>Acesso</h3><div class="field"><label for="s-pin">PIN do painel</label><input id="s-pin" name="pin" inputmode="numeric" value="${esc(t.pin || "")}"></div></div>` : ""}
      <div id="serr"></div>
      <button class="btn" type="submit">Salvar ajustes</button>
    </form>`;
    S.pend = {};
  }
  async function submitSettings(e) {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target).entries());
    const fee = money(d.deliveryFee || "0"), min = money(d.minOrder || "0");
    if (!d.name.trim()) { $("#serr").innerHTML = `<div class="alert">Informe o nome da loja.</div>`; return; }
    if (Number.isNaN(fee) || Number.isNaN(min)) { $("#serr").innerHTML = `<div class="alert">Confira os valores de taxa e pedido mínimo.</div>`; return; }
    const patch = {
      name: d.name.trim(), tagline: d.tagline.trim(), theme: { primary: d.primary, accent: d.accent },
      info: { whatsapp: (d.whatsapp || "").replace(/\D/g, ""), address: d.address.trim(), hours: d.hours.trim(), payments: d.payments.split(",").map((x) => x.trim()).filter(Boolean) },
      settings: { pickupEnabled: !!d.pickupEnabled, deliveryEnabled: !!d.deliveryEnabled, deliveryFee: fee || 0, minOrder: min || 0, avgPrepMinutes: Math.max(0, Number(d.avgPrepMinutes) || 0) }
    };
    if (S.pend.logo !== undefined) patch.logo = S.pend.logo; if (S.pend.cover !== undefined) patch.cover = S.pend.cover;
    if (Store.mode === "local" && d.pin) patch.pin = d.pin.trim();
    try { await Store.saveTenant(S.slug, patch); S.t = Store.mode === "local" ? await Store.getTenantFull(S.slug) : await Store.getTenant(S.slug); window.LM.applyTheme(S.t); $("#tName").textContent = S.t.name; $("#tAv").style.backgroundImage = S.t.logo ? `url("${S.t.logo}")` : "none"; renderAll(); toast("Ajustes salvos"); }
    catch (er) { $("#serr").innerHTML = `<div class="alert">${esc(er.message)}</div>`; }
  }

  /* ============================ DIVULGAÇÃO ============================ */
  function tabDivulgar() {
    const url = new URL("loja.html?l=" + S.slug, location.href).href;
    $("#page").innerHTML = `<div class="panel"><h3>Link do seu cardápio</h3>
      <p class="hint">Cole este link na bio do Instagram, no WhatsApp Business e em qualquer divulgação. O cliente pede direto, sem conversar com você.</p>
      <div class="linkbox"><input class="inp" id="lnk" readonly value="${esc(url)}" aria-label="Link do cardápio"><button class="btn" id="cpLnk" data-url="${esc(url)}">Copiar link</button><a class="btn btn--soft" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a></div></div>
      <div class="panel"><h3>QR Code para o balcão</h3><div id="qr" class="qr"></div><p class="hint">Aponte a câmera do celular para abrir o cardápio.</p></div>`;
    try { new QRCode($("#qr"), { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M }); } catch { $("#qr").textContent = "QR Code indisponível sem internet."; }
  }

  /* ---------------- eventos ---------------- */
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("button, a"); if (!t) return;
    const d = t.dataset;
    if (d.st) { const [id, st] = d.st.split("|"); setStatus(id, st); }
    else if (d.cancel) { S.confirm = d.cancel; tabPedidos(); }
    else if (d.print) printOrder(d.print);
    else if (t.id === "soundBtn") { S.sound = !S.sound; if (S.sound) beep(); tabPedidos(); }
    else if (d.filter) { S.filter = d.filter; tabEstoque(); }
    else if (d.sd) { const p = S.products.find((x) => x.id === d.sd); setStock(p.id, Math.max(0, (p.stock ?? 0) - 1)); }
    else if (d.si) { const p = S.products.find((x) => x.id === d.si); setStock(p.id, (p.stock ?? 0) + 1); }
    else if (d.newp !== undefined) editProduct("");
    else if (d.editp) editProduct(d.editp);
    else if (t.id === "sheetClose") closeSheet();
    else if (t.id === "p-imgrm") { S.editing.img = ""; $("#pPv").style.backgroundImage = "none"; $("#p-img").value = ""; }
    else if (t.id === "p-del") {
      if (!S.delConfirm) { S.delConfirm = true; t.textContent = "Toque de novo para excluir"; return; }
      await Store.deleteProduct(S.slug, S.editing.id); await load(); closeSheet(); renderTab(); toast("Produto excluído");
    }
    else if (t.id === "addCat") {
      const name = $("#newCat").value.trim(); if (!name) return;
      let id = slugify(name) || "cat", n = 1; while (S.t.categories.some((c) => c.id === id)) id = slugify(name) + "-" + ++n;
      await saveCats([...S.t.categories, { id, name }]);
    }
    else if (d.catup !== undefined || d.catdn !== undefined) {
      const i = Number(d.catup ?? d.catdn), j = d.catup !== undefined ? i - 1 : i + 1; const c = S.t.categories.slice(); [c[i], c[j]] = [c[j], c[i]]; await saveCats(c);
    }
    else if (d.catdel) {
      if (S.products.some((p) => p.category === d.catdel)) { toast("Mova ou exclua os produtos desta categoria antes de remover.", "bad"); return; }
      await saveCats(S.t.categories.filter((c) => c.id !== d.catdel));
    }
    else if (t.id === "cpLnk") navigator.clipboard?.writeText(d.url).then(() => toast("Link copiado"), () => { $("#lnk").select(); toast("Selecione e copie o link."); });
  });
  $("#sheetBack").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sheet) closeSheet(); });
  document.addEventListener("submit", (e) => { if (e.target.id === "pform") submitProduct(e); else if (e.target.id === "sform") submitSettings(e); });
  document.addEventListener("input", (e) => { if (e.target.id === "stq") { S.q = e.target.value; const pos = e.target.selectionStart; tabEstoque(); const el = $("#stq"); el.focus(); el.setSelectionRange(pos, pos); } });
  document.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.dataset.stock) { const v = t.value === "" ? null : Math.max(0, Math.floor(Number(t.value))); await setStock(t.dataset.stock, v); }
    else if (t.dataset.catname) { const c = S.t.categories.map((x) => (x.id === t.dataset.catname ? { ...x, name: t.value.trim() || x.name } : x)); await saveCats(c); }
    else if (t.id === "p-img" && t.files[0]) { try { S.editing.img = await fileToDataUrl(t.files[0], 640); $("#pPv").style.backgroundImage = `url("${S.editing.img}")`; } catch (er) { toast(er.message, "bad"); } }
    else if (t.id === "s-logo" && t.files[0]) { try { S.pend.logo = await fileToDataUrl(t.files[0], 320); $("#logoPv").style.backgroundImage = `url("${S.pend.logo}")`; } catch (er) { toast(er.message, "bad"); } }
    else if (t.id === "s-cover" && t.files[0]) { try { S.pend.cover = await fileToDataUrl(t.files[0], 1100); $("#coverPv").style.backgroundImage = `url("${S.pend.cover}")`; } catch (er) { toast(er.message, "bad"); } }
  });

  boot().catch((e) => { console.error(e); $("#login").hidden = false; $("#loginErr").innerHTML = `<div class="alert">Não foi possível carregar. Tente novamente.</div>`; });
})();
