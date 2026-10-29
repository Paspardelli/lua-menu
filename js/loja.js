/* ============================================================
   Vitrine da loja (cliente): cardápio, sacola, pedido e acompanhamento
   URL: loja.html?l=<endereço-da-loja>   |   &pedido=<código> para acompanhar
   ============================================================ */
(function () {
  const { $, fmt, toast, lsGet, lsSet, resolveLine } = window.LM;
  const { brl, esc } = fmt;
  const params = new URLSearchParams(location.search);
  const slug = (params.get("l") || window.LM_CONFIG.demoSlug || "").toLowerCase();

  const S = { t: null, products: [], cart: [], q: "", sheet: null, ps: null, form: null };
  const prod = (id) => S.products.find((p) => p.id === id);
  const sellable = (p) => p && p.active && p.price != null && p.stock !== 0;
  const inCart = (id) => S.cart.filter((l) => l.id === id).reduce((s, l) => s + l.qty, 0);
  const capFor = (p, exceptQty = 0) => (p.stock == null ? 99 : Math.max(0, p.stock - (inCart(p.id) - exceptQty)));
  const unit = (l) => { const p = prod(l.id); return resolveLine(p, l.opts).unit; };
  const lineLabels = (l) => resolveLine(prod(l.id), l.opts).labels;
  const lineOk = (l) => { const p = prod(l.id); if (!sellable(p)) return false; try { resolveLine(p, l.opts); return true; } catch { return false; } };
  const valid = () => S.cart.filter(lineOk);
  const subtotal = () => valid().reduce((s, l) => s + unit(l) * l.qty, 0);
  const count = () => valid().reduce((s, l) => s + l.qty, 0);
  const saveCart = () => lsSet("lm_cart_" + slug, S.cart);
  const open = () => S.t.settings.open;
  const canOrder = (p) => sellable(p) && open();

  /* ---------------- cabeçalho ---------------- */
  function renderHeader() {
    const t = S.t, st = t.settings;
    document.title = t.name + " | Cardápio digital";
    window.LM.applyTheme(t);
    $("#cover").style.backgroundImage = t.cover ? `url("${t.cover}")` : "none";
    $("#avatar").style.backgroundImage = t.logo ? `url("${t.logo}")` : "none";
    $("#avatar").setAttribute("aria-label", "Logo " + t.name);
    $("#name").textContent = t.name;
    $("#tagline").textContent = t.tagline || "";
    const b = [`<span class="badge ${st.open ? "badge--open" : "badge--closed"}"><i></i>${st.open ? "Aberto" : "Fechado"}</span>`];
    if (t.info.hours) b.push(`<span class="badge">🕒 ${esc(t.info.hours.split("\n")[0])}</span>`);
    const modes = [st.pickupEnabled && "Retirada", st.deliveryEnabled && "Entrega"].filter(Boolean).join(" · ");
    if (modes) b.push(`<span class="badge">${modes}</span>`);
    if (st.avgPrepMinutes) b.push(`<span class="badge">⏱ ~${st.avgPrepMinutes} min</span>`);
    if (st.minOrder > 0) b.push(`<span class="badge">Mínimo ${brl(st.minOrder)}</span>`);
    $("#badges").innerHTML = b.join("");
    $("#closedBanner").hidden = st.open;
  }

  /* ---------------- cardápio ---------------- */
  function rowHTML(p) {
    const out = p.stock === 0;
    const low = p.stock != null && p.stock > 0 && p.stock <= (p.lowAt ?? 5);
    let tag = p.tag ? `<span class="tag tag--new">${esc(p.tag)}</span>` : "";
    if (out) tag = `<span class="tag tag--out">Esgotado</span>`;
    else if (low) tag += `<span class="tag tag--low">Últimas unidades</span>`;
    const desc = p.desc && p.desc !== p.tag ? p.desc : "";
    const hasExtras = (p.options || []).some((g) => g.choices.some((c) => c.extra > 0));
    const price = p.price == null ? `<small>Preço sob consulta</small>` : (hasExtras ? `<small>a partir de </small>` : "") + brl(p.price);
    const q = inCart(p.id);
    const off = !canOrder(p);
    return `<button class="row" type="button" data-open="${p.id}" ${off ? "disabled" : ""}>
      <div class="row__txt">
        <div class="row__name">${esc(p.name)}${tag}</div>
        ${desc ? `<div class="row__desc">${esc(desc)}</div>` : ""}
        <div class="row__price">${price}</div>
      </div>
      ${p.img ? `<div class="row__img"><img src="${esc(p.img)}" alt="" loading="lazy" decoding="async" width="92" height="92">${q ? `<span class="row__qty">${q}</span>` : ""}</div>` : (q ? `<span class="tag tag--new">${q} na sacola</span>` : "")}
    </button>`;
  }

  /* Cardápio longo e leve: todas as categorias na mesma página, mas o navegador só
     desenha o que está na tela (content-visibility). Nada é redesenhado ao rolar. */
  const presentCats = () => S.t.categories.filter((c) => S.products.some((p) => p.category === c.id && p.active));
  const estH = (n, withImg) => 54 + n * (withImg ? 119 : 86);   // altura estimada da seção (evita pulos)
  function renderMenu() {
    const q = S.q.trim().toLowerCase();
    const cats = presentCats();
    if (!cats.some((c) => c.id === S.cat)) S.cat = cats[0] ? cats[0].id : null;
    let html = "";
    for (const c of cats) {
      const list = S.products.filter((p) => p.active && p.category === c.id && (!q || (p.name + " " + p.desc).toLowerCase().includes(q)));
      if (!list.length) continue;
      html += `<section class="sec" id="cat-${esc(c.id)}" data-id="${esc(c.id)}" style="contain-intrinsic-block-size:auto ${estH(list.length, list.some((p) => p.img))}px"><h2>${esc(c.name)}</h2><div class="list">${list.map(rowHTML).join("")}</div></section>`;
    }
    $("#menu").innerHTML = html || `<p class="empty">${q ? `Nada encontrado para "${esc(S.q)}".` : "O cardápio desta loja ainda está sendo montado."}</p>`;
    S.snap = {}; S.products.forEach((p) => { const n = inCart(p.id); if (n) S.snap[p.id] = n; });
    watchSections();
  }
  /* Atualiza só as linhas cujo número na sacola mudou (sem redesenhar o cardápio) */
  function syncQty() {
    const snap = S.snap || (S.snap = {});
    new Set([...Object.keys(snap), ...S.cart.map((l) => l.id)]).forEach((id) => {
      const n = inCart(id); if ((snap[id] || 0) === n) return;
      const row = document.querySelector(`.row[data-open="${id}"]`), p = prod(id);
      if (row && p) row.outerHTML = rowHTML(p);
      if (n) snap[id] = n; else delete snap[id];
    });
  }

  function renderNav() {
    $("#catNav").innerHTML = `<button class="srch" id="srchBtn" type="button" aria-label="Buscar"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"/></svg></button>` +
      presentCats().map((c) => `<button class="tab ${c.id === S.cat ? "is-on" : ""}" type="button" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join("");
  }
  /* Aba ativa acompanha a rolagem, usando IntersectionObserver (sem ler layout a cada rolagem) */
  let io;
  function watchSections() {
    if (io) io.disconnect();
    if (!("IntersectionObserver" in window)) return;
    io = new IntersectionObserver((ents) => {
      if (S.lock) return;
      const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActiveTab(vis.target.dataset.id);
    }, { rootMargin: "-110px 0px -65% 0px" });
    document.querySelectorAll(".sec").forEach((x) => io.observe(x));
    if (!watchSections.top) {
      watchSections.top = true;
      let tick = false;
      window.addEventListener("scroll", () => {
        if (tick || S.lock || window.scrollY > 260) return; tick = true;
        requestAnimationFrame(() => { tick = false; const f = document.querySelector(".sec"); if (f && !S.lock) setActiveTab(f.dataset.id); });
      }, { passive: true });
    }
  }
  function setActiveTab(id) {
    if (S.cat === id) return; S.cat = id;
    let on; document.querySelectorAll(".tab").forEach((b) => { const is = b.dataset.cat === id; b.classList.toggle("is-on", is); if (is) on = b; });
    const nav = $("#catNav"); if (on) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
  }
  function pickCat(id) {
    const el = document.getElementById("cat-" + id); if (!el) return;
    S.lock = true; clearTimeout(S.lockT); S.lockT = setTimeout(() => { S.lock = false; }, 500);
    setActiveTab(id);
    const go = () => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - $(".cats").offsetHeight - 4);
    go(); requestAnimationFrame(go); setTimeout(go, 120); setTimeout(go, 320);
  }

  function renderBar() {
    const n = count();
    $("#bar").hidden = n === 0 || !!S.sheet || !$("#view-menu") || $("#view-menu").hidden;
    $("#barQty").textContent = n; $("#barTotal").textContent = brl(subtotal());
  }

  /* ---------------- sheet ---------------- */
  function openSheet(mode, title) {
    S.sheet = mode; $("#sheetTitle").textContent = title;
    $("#sheet").hidden = false; $("#sheetBack").hidden = false; document.body.style.overflow = "hidden"; renderBar();
  }
  function closeSheet() {
    S.sheet = null; $("#sheet").hidden = true; $("#sheetBack").hidden = true; document.body.style.overflow = "";
    syncQty(); renderBar();
  }

  /* ---- produto ---- */
  function openProduct(id) {
    const p = prod(id); if (!p || !canOrder(p)) return;
    const cap = capFor(p);
    if (cap < 1) { toast("Você já adicionou todo o estoque disponível deste item.", "bad"); return; }
    S.ps = { p, sel: {}, qty: 1, obs: "" };
    openSheet("product", "Detalhes do item");
    renderProduct();
  }
  function psUnit() {
    const { p, sel } = S.ps; let extra = 0;
    (p.options || []).forEach((g, gi) => { const c = g.choices[sel[gi]]; if (c) extra += Number(c.extra || 0); });
    return p.price + extra;
  }
  function psMissing() { return (S.ps.p.options || []).findIndex((g, gi) => g.required && S.ps.sel[gi] === undefined); }
  function renderProduct() {
    const { p, qty } = S.ps; const cap = capFor(p);
    $("#sheetBody").innerHTML = `
      ${p.img ? `<div class="pimg" style="background-image:url('${esc(p.img)}')" role="img" aria-label="${esc(p.name)}"></div>` : ""}
      <h3 class="pname">${esc(p.name)}</h3>
      ${p.desc && p.desc !== p.tag ? `<p class="pdesc">${esc(p.desc)}</p>` : ""}
      <p class="pprice">${brl(p.price)}</p>
      ${p.stock != null && p.stock <= (p.lowAt ?? 5) ? `<p class="hint">Restam ${p.stock} unidades.</p>` : ""}
      ${(p.options || []).map((g, gi) => `<div class="grp"><div class="grp__h"><span>${esc(g.title)}</span><small class="${g.required ? "req" : ""}">${g.required ? "Obrigatório" : "Opcional"}</small></div>
        ${g.choices.map((c, ci) => `<label class="choice"><input type="radio" name="g${gi}" value="${ci}" data-g="${gi}"><span>${esc(c.name)}</span>${c.extra ? `<em>+ ${brl(c.extra)}</em>` : ""}</label>`).join("")}</div>`).join("")}
      <div class="field"><label for="ps-obs">Observações</label><textarea id="ps-obs" rows="2" maxlength="200" placeholder="Ex.: sem cebola, bem passado…"></textarea></div>
      <div id="psErr"></div>
      <div class="pfoot">
        <div class="step"><button id="psDec" type="button" aria-label="Diminuir">−</button><span id="psQty">${qty}</span><button id="psInc" type="button" aria-label="Aumentar" ${qty >= cap ? "disabled" : ""}>+</button></div>
        <button class="btn" id="psAdd" type="button">Adicionar <span id="psTot">${brl(psUnit() * qty)}</span></button>
      </div>`;
  }
  function psRefresh() {
    const cap = capFor(S.ps.p);
    $("#psQty").textContent = S.ps.qty; $("#psTot").textContent = brl(psUnit() * S.ps.qty);
    $("#psDec").disabled = S.ps.qty <= 1; $("#psInc").disabled = S.ps.qty >= cap;
  }
  function psAdd() {
    const miss = psMissing();
    if (miss >= 0) { $("#psErr").innerHTML = `<div class="alert">Escolha uma opção em "${esc(S.ps.p.options[miss].title)}".</div>`; return; }
    const { p, sel, qty } = S.ps;
    const opts = (p.options || []).map((g, gi) => (sel[gi] !== undefined ? { g: g.title, c: g.choices[sel[gi]].name } : null)).filter(Boolean);
    const obs = ($("#ps-obs").value || "").trim();
    const key = JSON.stringify([p.id, opts, obs]);
    const ex = S.cart.find((l) => l.key === key);
    if (ex) ex.qty += qty; else S.cart.push({ key, id: p.id, qty, opts, obs });
    saveCart(); closeSheet(); toast("Adicionado à sacola");
  }

  /* ---- sacola ---- */
  function openCart() { openSheet("cart", "Sua sacola"); renderCart(); }
  function renderCart() {
    const ls = valid();
    if (!ls.length) { $("#sheetBody").innerHTML = `<p class="empty">Sua sacola está vazia.<br>Escolha algo gostoso no cardápio.</p><button class="btn btn--block" data-close>Ver cardápio</button>`; return; }
    const min = S.t.settings.minOrder || 0;
    $("#sheetBody").innerHTML = ls.map((l) => { const p = prod(l.id); return `<div class="line">
      <div class="line__t"><div class="line__n">${esc(p.name)}</div>
        ${lineLabels(l).length ? `<div class="line__o">${esc(lineLabels(l).join(" · "))}</div>` : ""}${l.obs ? `<div class="line__o">Obs.: ${esc(l.obs)}</div>` : ""}
        <div class="line__p tabular">${brl(unit(l))} cada</div></div>
      <div class="step"><button data-ldec="${esc(l.key)}" aria-label="Diminuir">−</button><span>${l.qty}</span><button data-linc="${esc(l.key)}" aria-label="Aumentar" ${capFor(p) < 1 ? "disabled" : ""}>+</button></div></div>`; }).join("") + `
      <div class="sum"><div class="total"><span>Subtotal</span><span class="tabular">${brl(subtotal())}</span></div></div>
      ${min > 0 && subtotal() < min ? `<div class="alert">Pedido mínimo: ${brl(min)}.</div>` : ""}
      <button class="btn btn--block" id="goCheckout" ${open() && subtotal() >= min ? "" : "disabled"}>Continuar</button>
      <button class="btn btn--ghost btn--block" style="margin-top:8px" data-close>Adicionar mais itens</button>`;
  }
  function changeLine(key, d) {
    const l = S.cart.find((x) => x.key === key); if (!l) return;
    const p = prod(l.id);
    if (d > 0 && capFor(p) < 1) { toast("Estoque máximo deste item atingido.", "bad"); return; }
    l.qty += d; if (l.qty <= 0) S.cart = S.cart.filter((x) => x !== l);
    saveCart(); renderCart(); renderBar();
  }

  /* ---- finalizar ---- */
  function renderCheckout(errs = {}, serverErr = "") {
    $("#sheetTitle").textContent = "Finalizar pedido";
    const c = lsGet("lm_customer", {}), st = S.t.settings;
    const type = S.form?.type || (st.pickupEnabled ? "retirada" : "entrega");
    S.form = { ...(S.form || {}), type };
    const fee = type === "entrega" ? Number(st.deliveryFee || 0) : 0;
    const f = (k, d = "") => esc(S.form[k] ?? c[k] ?? d);
    const bad = (k) => (errs[k] ? "bad" : ""), er = (k) => (errs[k] ? `<div class="err">${errs[k]}</div>` : "");
    const pays = S.t.info.payments && S.t.info.payments.length ? S.t.info.payments : ["Dinheiro"];
    $("#sheetBody").innerHTML = `${serverErr ? `<div class="alert">${esc(serverErr)}</div>` : ""}
      <form id="form" novalidate>
        <div class="field"><span class="lbl">Como você quer receber?</span><div class="seg">
          ${st.pickupEnabled ? `<label><input type="radio" name="type" value="retirada" ${type === "retirada" ? "checked" : ""}><span>🏪 Retirada</span></label>` : ""}
          ${st.deliveryEnabled ? `<label><input type="radio" name="type" value="entrega" ${type === "entrega" ? "checked" : ""}><span>🛵 Entrega</span></label>` : ""}</div></div>
        <div class="field"><label for="f-name">Seu nome</label><input id="f-name" name="name" class="${bad("name")}" value="${f("name")}" autocomplete="name">${er("name")}</div>
        <div class="field"><label for="f-phone">Telefone (WhatsApp)</label><input id="f-phone" name="phone" class="${bad("phone")}" inputmode="tel" placeholder="(00) 00000-0000" value="${f("phone")}" autocomplete="tel">${er("phone")}</div>
        ${type === "entrega" ? `<div class="field"><label for="f-addr">Endereço (rua e número)</label><input id="f-addr" name="address" class="${bad("address")}" value="${f("address")}" autocomplete="street-address">${er("address")}</div>
        <div class="field"><label for="f-nb">Bairro / complemento</label><input id="f-nb" name="neighborhood" value="${f("neighborhood")}"></div>` : ""}
        <div class="field"><label for="f-pay">Pagamento ${type === "entrega" ? "na entrega" : "na retirada"}</label><select id="f-pay" name="payment" class="${bad("payment")}"><option value="">Escolha…</option>${pays.map((o) => `<option ${S.form.payment === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>${er("payment")}</div>
        <div class="field"><label for="f-note">Observações do pedido</label><textarea id="f-note" name="note" rows="2" maxlength="300">${esc(S.form.note ?? "")}</textarea></div>
        <div class="sum"><div><span>Subtotal</span><span class="tabular">${brl(subtotal())}</span></div>
          ${type === "entrega" ? `<div><span>Taxa de entrega</span><span class="tabular">${fee ? brl(fee) : "Grátis"}</span></div>` : ""}
          <div class="total"><span>Total</span><span class="tabular">${brl(subtotal() + fee)}</span></div></div>
        <p class="hint">O pagamento é feito ${type === "entrega" ? "na entrega" : "na retirada"}.${st.avgPrepMinutes ? ` Preparo médio: cerca de ${st.avgPrepMinutes} min.` : ""}</p>
        <button class="btn btn--block" type="submit" id="submitBtn">Enviar pedido</button>
        <button class="btn btn--ghost btn--block" style="margin-top:8px" type="button" id="backCart">Voltar à sacola</button>
      </form>`;
  }
  const readForm = () => { const d = Object.fromEntries(new FormData($("#form")).entries()); S.form = { ...(S.form || {}), ...d }; return d; };

  async function submit(ev) {
    ev.preventDefault(); const d = readForm(); const errs = {};
    if (!d.name || d.name.trim().length < 2) errs.name = "Informe seu nome.";
    if (!/^\d{10,11}$/.test((d.phone || "").replace(/\D/g, ""))) errs.phone = "Informe um telefone com DDD.";
    if (d.type === "entrega" && (!d.address || d.address.trim().length < 5)) errs.address = "Informe o endereço de entrega.";
    if (!d.payment) errs.payment = "Escolha a forma de pagamento.";
    if (Object.keys(errs).length) { renderCheckout(errs); const first = $("#form .bad"); if (first) first.focus(); return; }
    const btn = $("#submitBtn"); btn.disabled = true; btn.textContent = "Enviando…";
    try {
      const res = await Store.createOrder(slug, {
        type: d.type, payment: d.payment, note: (d.note || "").trim(),
        customer: { name: d.name.trim(), phone: d.phone.replace(/\D/g, ""), address: d.type === "entrega" ? d.address.trim() : "", neighborhood: d.type === "entrega" ? (d.neighborhood || "").trim() : "" },
        items: valid().map((l) => ({ id: l.id, qty: l.qty, opts: l.opts, obs: l.obs }))
      });
      lsSet("lm_customer", { name: d.name.trim(), phone: d.phone, address: d.address || "", neighborhood: d.neighborhood || "" });
      S.cart = []; saveCart(); S.form = null; await refresh(); renderDone(res.code);
    } catch (e) { await refresh(); renderCheckout({}, e.message || "Não foi possível enviar o pedido."); $("#sheetBody").scrollTop = 0; }
  }
  const trackUrl = (code) => location.href.split("?")[0].split("#")[0] + "?l=" + slug + "&pedido=" + code;
  function renderDone(code) {
    S.sheet = "done"; $("#sheetTitle").textContent = "Pedido enviado!";
    $("#sheetBody").innerHTML = `<div class="done"><div class="done__ico" aria-hidden="true">✓</div><p>Recebemos seu pedido. Guarde o código:</p><div class="code">${code}</div>
      <p class="hint">Use o link para acompanhar o andamento.</p>
      <button class="btn btn--block" data-track="${code}">Acompanhar pedido</button>
      <button class="btn btn--ghost btn--block" style="margin-top:8px" id="copyLink" data-link="${trackUrl(code)}">Copiar link de acompanhamento</button>
      <button class="btn btn--soft btn--block" style="margin-top:8px" data-close>Voltar ao cardápio</button></div>`;
    renderBar();
  }

  /* ---- informações da loja ---- */
  function openInfo() {
    const t = S.t, i = t.info, st = t.settings; openSheet("info", "Sobre a loja");
    const wa = (i.whatsapp || "").replace(/\D/g, "");
    $("#sheetBody").innerHTML = `
      ${i.hours ? `<div class="info-row"><b>Horário</b><span>${esc(i.hours).replace(/\n/g, "<br>")}</span></div>` : ""}
      ${i.address ? `<div class="info-row"><b>Endereço</b><span>${esc(i.address)}</span></div>` : ""}
      <div class="info-row"><b>Receber</b><span>${[st.pickupEnabled && "Retirada no local", st.deliveryEnabled && `Entrega${st.deliveryFee ? " (" + brl(st.deliveryFee) + ")" : " (grátis)"}`].filter(Boolean).join(" · ") || "Indisponível"}</span></div>
      ${st.avgPrepMinutes ? `<div class="info-row"><b>Preparo</b><span>Cerca de ${st.avgPrepMinutes} minutos</span></div>` : ""}
      <div class="info-row"><b>Pagamento</b><div class="pay">${(i.payments || []).map((x) => `<span>${esc(x)}</span>`).join("")}</div></div>
      ${wa ? `<a class="btn btn--soft btn--block" style="margin-top:12px" href="https://wa.me/${wa}" target="_blank" rel="noopener">Falar com a loja no WhatsApp</a>` : ""}`;
  }

  /* ---------------- acompanhamento ---------------- */
  async function showTrack(code) {
    $("#view-menu").hidden = true; $("#view-track").hidden = false; renderBar();
    const v = $("#view-track");
    const paint = async () => {
      let o = null; try { o = await Store.getOrderByCode(slug, code); } catch {}
      if (!o) { v.innerHTML = `<h1>Pedido não encontrado</h1><p>Confira o código <b>${esc(code)}</b>. Se você fez o pedido em outro aparelho, abra o link recebido.</p><button class="btn btn--block" id="backMenu">Ir para o cardápio</button>`; return; }
      const flow = [["novo", "Pedido recebido", "A loja já viu seu pedido."], ["preparando", "Em preparo", "Estamos preparando com carinho."],
        ["pronto", o.type === "entrega" ? "Pronto para sair" : "Pronto para retirar", o.type === "entrega" ? "Seu pedido está saindo." : "Pode vir buscar."], ["entregue", "Concluído", "Bom apetite!"]];
      const idx = flow.findIndex((f) => f[0] === o.status);
      v.innerHTML = `<p class="hint">${esc(S.t.name)} · pedido</p><h1>${esc(o.code)}</h1>
        <p>${esc(o.customer?.name || "")} · ${o.type === "entrega" ? "Entrega" : "Retirada"} · ${brl(o.total)}</p>
        ${o.status === "cancelado" ? `<div class="alert">Este pedido foi cancelado. Em caso de dúvida, fale com a loja.</div>` : `<ol class="steps">${flow.map((f, i) => `<li class="${i <= idx ? "on" : ""} ${i === idx ? "now" : ""}"><span class="dot">${i < idx ? "✓" : ""}</span><div><b>${f[1]}</b><span class="s">${f[2]}</span></div></li>`).join("")}</ol>`}
        <div class="sum">${o.items.map((i) => `<div><span>${i.qty}× ${esc(i.name)}</span><span class="tabular">${brl(i.price * i.qty)}</span></div>`).join("")}
          ${o.fee ? `<div><span>Taxa de entrega</span><span class="tabular">${brl(o.fee)}</span></div>` : ""}<div class="total"><span>Total</span><span class="tabular">${brl(o.total)}</span></div></div>
        <p class="hint">Esta página atualiza sozinha.</p><button class="btn btn--ghost btn--block" id="backMenu">Fazer outro pedido</button>`;
    };
    clearInterval(S.trackT); await paint(); S.trackT = setInterval(paint, 6000);
  }

  /* ---------------- dados ---------------- */
  async function refresh() {
    const [t, products] = await Promise.all([Store.getTenant(slug), Store.getProducts(slug)]);
    if (!t || !t.active) return gone(t);
    const sig = JSON.stringify([t, products]);
    const first = S.sig === undefined;
    if (sig === S.sig) return;               // nada mudou: não redesenha (evita travar)
    const catsChanged = first || JSON.stringify(t.categories) !== JSON.stringify(S.t && S.t.categories) || products.length !== S.products.length;
    S.sig = sig; S.t = t; S.products = products;
    let changed = false;
    S.cart = S.cart.filter((l) => { if (!lineOk(l)) { changed = true; return false; } return true; });
    S.cart.forEach((l) => { const p = prod(l.id); if (p.stock != null && inCart(p.id) > p.stock) { l.qty = Math.max(1, l.qty - (inCart(p.id) - p.stock)); changed = true; } });
    if (changed) saveCart();
    renderHeader(); if (catsChanged) renderNav(); renderMenu(); renderBar();
  }
  function gone(t) {
    $("#view-menu").hidden = true; $("#view-track").hidden = true; $("#bar").hidden = true;
    $("#view-gone").hidden = false;
    $("#view-gone").innerHTML = `<div><h1>${t ? "Loja temporariamente indisponível" : "Loja não encontrada"}</h1><p class="hint">${t ? "Volte em instantes." : "Confira o endereço do link."}</p><a class="btn" href="site/index.html">Conhecer o Lua Menu</a></div>`;
  }

  /* ---------------- eventos ---------------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a, [data-open]"); if (!t) return;
    if (t.dataset.open) openProduct(t.dataset.open);
    else if (t.id === "bar") openCart();
    else if (t.dataset.track) { closeSheet(); showTrack(t.dataset.track); try { history.replaceState(null, "", trackUrl(t.dataset.track)); } catch {} window.scrollTo(0, 0); }
    else if (t.id === "backMenu") { clearInterval(S.trackT); $("#view-track").hidden = true; $("#view-menu").hidden = false; try { history.replaceState(null, "", location.pathname + "?l=" + slug); } catch {} renderBar(); refresh(); }
    else if (t.id === "infoBtn") openInfo();
    else if (t.id === "sheetClose" || t.hasAttribute("data-close")) closeSheet();
    else if (t.dataset.linc) changeLine(t.dataset.linc, 1);
    else if (t.dataset.ldec) changeLine(t.dataset.ldec, -1);
    else if (t.id === "goCheckout") { openSheet("checkout", "Finalizar pedido"); renderCheckout(); }
    else if (t.id === "backCart") { readForm(); openSheet("cart", "Sua sacola"); renderCart(); }
    else if (t.id === "psInc") { if (S.ps.qty < capFor(S.ps.p)) S.ps.qty++; psRefresh(); }
    else if (t.id === "psDec") { if (S.ps.qty > 1) S.ps.qty--; psRefresh(); }
    else if (t.id === "psAdd") psAdd();
    else if (t.id === "copyLink") navigator.clipboard?.writeText(t.dataset.link).then(() => toast("Link copiado"), () => toast("Copie o link pela barra do navegador."));
    else if (t.id === "srchBtn") { const b = $("#searchBox"); b.hidden = !b.hidden; if (!b.hidden) $("#search").focus(); else { S.q = ""; $("#search").value = ""; renderMenu(); } }
    else if (t.dataset.cat) pickCat(t.dataset.cat);
  });
  $("#sheetBack").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sheet) closeSheet(); });
  $("#search").addEventListener("input", (e) => { S.q = e.target.value; renderMenu(); });
  document.addEventListener("submit", (e) => { if (e.target.id === "form") submit(e); });
  document.addEventListener("change", (e) => {
    if (e.target.name === "type") { readForm(); renderCheckout(); }
    else if (e.target.dataset && e.target.dataset.g !== undefined && S.ps) { S.ps.sel[e.target.dataset.g] = Number(e.target.value); psRefresh(); }
  });
  document.addEventListener("input", (e) => { if (e.target.name === "phone") e.target.value = fmt.phone(e.target.value); });

  /* ---------------- início ---------------- */
  (async function init() {
    await Store.init();
    S.cart = lsGet("lm_cart_" + slug, []);
    await refresh();
    if (S.t) {
      const code = params.get("pedido");
      if (code) showTrack(code); else { $("#view-menu").hidden = false; renderBar(); Store.watch(() => { if (!S.sheet && !document.hidden) refresh().catch(() => {}); }); }
    }
  })().catch((e) => { $("#view-gone").hidden = false; $("#view-gone").innerHTML = `<div><h1>Não foi possível carregar</h1><p class="hint">Tente novamente em instantes.</p></div>`; console.error(e); });
})();
