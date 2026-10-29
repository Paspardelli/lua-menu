/* ============================================================
   Utilitários compartilhados (formatação, opções de produto, imagens)
   ============================================================ */
(function () {
  const money = (n) => Math.round(Number(n) * 100) / 100;

  const fmt = {
    brl: (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    time: (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    dateTime: (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    statusLabel: { novo: "Novo", preparando: "Preparando", pronto: "Pronto", entregue: "Concluído", cancelado: "Cancelado" },
    phone: (v) => {
      v = String(v || "").replace(/\D/g, "").slice(0, 11);
      if (v.length > 6) return v.replace(/^(\d{2})(\d{4,5})(\d{4}).*/, "($1) $2-$3");
      if (v.length > 2) return v.replace(/^(\d{2})(\d+)/, "($1) $2");
      return v;
    }
  };

  const slugify = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  /* ---- Opções de produto -------------------------------------------------
     Texto editável pelo dono, uma linha por grupo:
       * Preparo: Com água; Com leite
       Adicionais: Bacon (+3,00); Cheddar (+2,50)
     "*" no começo = escolha obrigatória. Preço extra entre parênteses.      */
  function parseOptions(text) {
    return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
      const required = line.startsWith("*");
      if (required) line = line.slice(1).trim();
      const i = line.indexOf(":");
      if (i < 1) return null;
      const title = line.slice(0, i).trim();
      const choices = line.slice(i + 1).split(";").map((c) => c.trim()).filter(Boolean).map((c) => {
        const m = c.match(/^(.*?)\s*\(\s*\+\s*(?:R\$)?\s*([\d.,]+)\s*\)\s*$/);
        if (!m) return { name: c, extra: 0 };
        return { name: m[1].trim(), extra: money(parseFloat(m[2].replace(/\./g, "").replace(",", ".")) || 0) };
      });
      return choices.length ? { title, required, choices } : null;
    }).filter(Boolean);
  }
  function optionsToText(opts) {
    return (opts || []).map((g) => (g.required ? "* " : "") + g.title + ": " + g.choices.map((c) => c.name + (c.extra ? ` (+${String(c.extra).replace(".", ",")})` : "")).join("; ")).join("\n");
  }

  /* Valida as escolhas do cliente e calcula o preço unitário (base + extras) */
  function resolveLine(p, opts) {
    let extra = 0; const labels = [];
    for (const g of p.options || []) {
      const picked = (opts || []).filter((o) => o.g === g.title);
      if (g.required && !picked.length) throw new Error(`Escolha uma opção em "${g.title}" (${p.name}).`);
      if (picked.length > 1) throw new Error(`Escolha apenas uma opção em "${g.title}".`);
      for (const o of picked) {
        const ch = g.choices.find((c) => c.name === o.c);
        if (!ch) throw new Error("Opção inválida em " + p.name + ".");
        extra += Number(ch.extra || 0); labels.push(`${g.title}: ${ch.name}`);
      }
    }
    return { unit: money(Number(p.price) + extra), labels };
  }

  /* Reduz uma imagem enviada pelo dono para caber no navegador/banco (JPEG ~ 40 KB) */
  function fileToDataUrl(file, max = 640, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  let toastT;
  function toast(msg, kind) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.dataset.kind = kind || ""; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3000);
  }
  const lsGet = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch { return fb; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function applyTheme(t) {
    const th = (t && t.theme) || {};
    const r = document.documentElement.style;
    if (th.primary) r.setProperty("--brand", th.primary);
    if (th.accent) r.setProperty("--accent", th.accent);
  }

  window.LM = { money, fmt, slugify, parseOptions, optionsToText, resolveLine, fileToDataUrl, $, $$, toast, lsGet, lsSet, applyTheme };
})();
