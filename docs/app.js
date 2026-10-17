// app.js — UI y sincronización de la PWA. CSP: sin inline, sin eval.
import {
  APP_VERSION, esNumero, formatAR, formatUSD0, formatUSD2,
  armarFilas, resumenPortfolio, realizadoTotales, pesosVivos, ordenarPorValorVivo, antiguedadHs,
  pnlNoRealizadoPct,
} from "./calc.js";

const API_BASE = "https://api.github.com/repos/garantias3-afk/pipeline-bursatil/contents";
const REF = "app-data";
const FILES = ["app-data.json", "precios.json"];
const TOKEN_URL = "https://github.com/settings/personal-access-tokens";
const TOKEN_KEY = "cotizaciones_token";
const EXPIRY_KEY = "cotizaciones_token_expiry";
const CACHE_KEY = "cotizaciones_cache";

const estado = {
  token: null,
  expiry: null,
  cache: {}, // file -> {sha, json, fetched_at}
  screen: "portfolio",
  sortAsc: false,
  sincError: null,
  online: true,
  vendors: {},
};

function $(id) { return document.getElementById(id); }
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function b64DecodeUnicode(str) {
  return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
}

function cargarEstado() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) estado.cache = JSON.parse(raw);
  } catch (e) { estado.cache = {}; }
  estado.token = localStorage.getItem(TOKEN_KEY) || null;
  estado.expiry = localStorage.getItem(EXPIRY_KEY) || null;
  estado.sincError = null;
}
function guardarEstado() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(estado.cache)); } catch (e) {}
}
function guardarToken(token, expiry) {
  estado.token = token;
  if (!expiry) {
    const d = new Date(Date.now() + 85 * 24 * 3600 * 1000); // fallback D6: carga + 85 días
    expiry = d.toISOString();
  }
  estado.expiry = expiry;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, expiry);
}
function borrarToken() {
  estado.token = null;
  estado.expiry = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

function headers() {
  return {
    Authorization: "Bearer " + estado.token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fetchFile(file) {
  const url = API_BASE + "/" + file + "?ref=" + REF;
  try {
    const resp = await fetch(url, { headers: headers(), cache: "no-store" });
    const expHeader = resp.headers.get("github-authentication-token-expiration");
    if (expHeader && !estado.expiry) {
      estado.expiry = expHeader;
      try { localStorage.setItem(EXPIRY_KEY, expHeader); } catch (e) {}
    }
    if (resp.status === 401 || resp.status === 403) return { ok: false, status: resp.status, error: "TOKEN_EXPIRADO" };
    if (resp.status === 404) return { ok: false, status: 404, error: "AUSENTE" };
    if (!resp.ok) return { ok: false, status: resp.status, error: "RED_" + resp.status };
    const data = await resp.json();
    const sha = data.sha;
    const contenido = b64DecodeUnicode(data.content);
    let json;
    try { json = JSON.parse(contenido); } catch (e) { return { ok: false, status: resp.status, error: "ESCHEMA_INVALIDO" }; }
    return { ok: true, sha, json, fetched_at: new Date().toISOString() };
  } catch (e) {
    return { ok: false, error: "SIN_RED", status: 0 };
  }
}

function validarPrecios(json) {
  return json && json.schema === 4 && json.precios && typeof json.precios === "object";
}
function validarAppData(json) {
  return json && json.appdata === 5 && json.portfolio && Array.isArray(json.portfolio.tickers);
}

async function sincronizar() {
  estado.sincError = null;
  for (const file of FILES) {
    const prev = estado.cache[file];
    const res = await fetchFile(file);
    if (!res.ok && (res.error === "TOKEN_EXPIRADO" || res.error === "AUSENTE" || res.error === "ESCHEMA_INVALIDO")) {
      estado.sincError = res.error;
    }
    if (res.ok) {
      if (prev && prev.sha === res.sha) {
        // mismo sha: no reprocesa el contenido
      } else {
        let valido = true;
        if (file === "precios.json" && !validarPrecios(res.json)) valido = false;
        if (file === "app-data.json" && !validarAppData(res.json)) valido = false;
        if (!valido) {
          res.ok = false;
          res.error = "ESCHEMA_INVALIDO";
          estado.sincError = "ESCHEMA_INVALIDO";
        } else {
          estado.cache[file] = { sha: res.sha, json: res.json, fetched_at: res.fetched_at };
          guardarEstado();
        }
      }
    }
  }
}

function datosCache() {
  return {
    precios: estado.cache["precios.json"] ? estado.cache["precios.json"].json : null,
    appdata: estado.cache["app-data.json"] ? estado.cache["app-data.json"].json : null,
  };
}

function fuenteHumana(p) {
  if (!p) return "SIN DATO";
  if (p.source === "IOL") return "IOL";
  if (p.source === "YAHOO") return "Yahoo";
  return "NO_VERIFICADO";
}
function edadHumana(tsIso) {
  const h = antiguedadHs(tsIso);
  if (h === null) return "sin fecha";
  if (h < 1) return "pocos minutos";
  if (h < 24) return Math.floor(h) + " hs";
  return Math.floor(h / 24) + " días";
}
function dineroUsd(v, decimales) {
  return decimales === 2 ? formatUSD2(v) : formatUSD0(v);
}
function dineroClass(v) {
  if (!esNumero(v)) return "neutro";
  return v > 0 ? "pos" : (v < 0 ? "neg" : "neutro");
}

// ---------- Render ----------
function bannerSinc() {
  const el = $("banner-sinc");
  if (!el) return;
  const { precios } = datosCache();
  const ahora = new Date();
  if (!estado.token) { el.textContent = "Configurá el token"; el.className = "banner token"; return; }
  if (estado.sincError === "TOKEN_EXPIRADO") {
    el.innerHTML = 'TOKEN EXPIRADO — <a href="' + TOKEN_URL + '" target="_blank" rel="noopener noreferrer">regenerar</a>';
    el.className = "banner token"; return;
  }
  if (estado.sincError === "AUSENTE") { el.textContent = "Archivo de datos ausente"; el.className = "banner token"; return; }
  if (estado.sincError === "ESCHEMA_INVALIDO") { el.textContent = "DATOS INVÁLIDOS"; el.className = "banner token"; return; }
  if (!navigator.onLine) {
    const pf = estado.cache["app-data.json"];
    const t = pf ? pf.fetched_at : "";
    el.textContent = "SIN CONEXIÓN — datos de " + (t ? t.slice(0,16).replace("T"," ") : "nunca");
    el.className = "banner sinconexion";
    return;
  }
  if (estado.expiry && new Date(estado.expiry) < ahora) {
    el.innerHTML = 'TOKEN EXPIRADO — <a href="' + TOKEN_URL + '" target="_blank" rel="noopener noreferrer">regenerar</a>';
    el.className = "banner token";
    return;
  }
  const app = estado.cache["app-data.json"];
  const prec = estado.cache["precios.json"];
  if (app) {
    let html = "Cartera actualizada " + (app.fetched_at || "").slice(0,16).replace("T"," ") + " · sha " + (app.sha || "").slice(0,7);
    if (prec) html += '<br><span class="edad">Precios ' + (prec.json.generated_at || "").slice(0,16).replace("T"," ") + "</span>";
    el.innerHTML = html;
    el.className = "banner ok";
  } else if (prec) {
    el.textContent = "Cartera actualizada · datos de precios";
    el.className = "banner ok";
  } else {
    el.textContent = "Configurá el token";
    el.className = "banner token";
  }
}

function renderPortfolio() {
  const { appdata } = datosCache();
  const cont = $("lista-portfolio");
  cont.innerHTML = "";
  if (!appdata) {
    $("tot-valor-vivo").textContent = "N/D";
    $("tot-pnl").textContent = "N/D";
    $("tot-realizado").textContent = "N/D";
    $("tot-general").textContent = "N/D";
    $("tot-cierre").textContent = "sin datos";
    return;
  }
  const { precios } = datosCache();
  const filas = armarFilas(appdata, precios);
  const res = resumenPortfolio(filas, appdata);
  const ordenadas = ordenarPorValorVivo(filas, estado.sortAsc);
  const pesos = pesosVivos(ordenadas);
  for (let i = 0; i < ordenadas.length; i++) {
    const f = ordenadas[i];
    const pct = pesos[i];
    const pnlCls = dineroClass(f.pnl);
    const marca = [];
    if (f.source === "NO_VERIFICADO") marca.push("NO VERIFICADO");
    if (f.ratioOk === false) marca.push("RATIO SOSPECHOSO");
    if (f.sessionOk === false) marca.push("PRECIO STALE");
    if (f.usaVC) marca.push("valor_cierre");
    if (f.ratioOk === null && f.instrumento === "CEDEAR") marca.push("ratio sin control");
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="ticker"><strong>' + escapeHtml(f.ticker) + '</strong>' + (marca.length ? '<br><span class="marca">' + marca.join(" · ") + '</span>' : "") + '</td>' +
      '<td>' + (esNumero(f.cant) ? formatAR(f.cant, 2) : "—") + '</td>' +
      '<td>' + (esNumero(f.precio) ? formatUSD2(f.precio) : "—") + ' <span class="badge badge-' + (f.source || "des").toLowerCase() + '">' + fuenteHumana(f) + '</span> <span class="edad">' + edadHumana(f.ts) + '</span></td>' +
      '<td class="' + dineroClass(f.valorRef) + '">' + dineroUsd(f.valorRef, 0) + (f.usaVC ? ' <span class="marca vc">Excel</span>' : "") + '</td>' +
      '<td class="' + pnlCls + '">' + dineroUsd(f.pnl, 0) + ' <span class="pnl-pct">' + (pnlNoRealizadoPct(f.pnl, f.costo) === null ? "" : formatAR(pnlNoRealizadoPct(f.pnl, f.costo), 2) + "%") + '</span></td>' +
      '<td>' + formatAR(pct, 2) + "%</td>";
    cont.appendChild(tr);
  }
  // Tarjetas (E15)
  $("tot-valor-vivo").textContent = dineroUsd(res.totalVivo, 0);
  $("delta-vivo").textContent = (res.delta === null ? "Δ vs cierre Excel" : "Δ " + dineroUsd(res.delta, 0) + " (" + formatAR(res.deltaPct, 2) + "%) vs cierre Excel");
  $("tot-pnl").textContent = dineroUsd(res.pnlTotal, 0);
  $("pnl-pct").textContent = (res.pnlPct === null ? "sobre costo" : formatAR(res.pnlPct, 2) + "% sobre costo");
  // Realizado (E15): año actual + total histórico; si null → "sin datos (motivo)"
  const rd = appdata.realizadas;
  if (rd === null || rd === undefined) {
    $("tot-realizado").textContent = "sin datos";
    $("realizado-det").textContent = "(" + escapeHtml(appdata.realizadas_motivo || "sin datos") + ")";
  } else {
    const rt = realizadoTotales(rd);
    const anioActual = String(new Date().getFullYear());
    const delAnio = rt.porAnio[anioActual];
    $("tot-realizado").textContent = dineroUsd(delAnio === undefined ? null : delAnio, 0);
    $("realizado-det").textContent = "total histórico " + dineroUsd(rt.totalUsd, 0);
  }
  $("tot-general").textContent = dineroUsd(res.totalGeneral, 0);
  $("tot-cierre").textContent = dineroUsd(res.totalCierre, 0) + " · " + (appdata.portfolio.fecha_cierre_excel || "sin fecha");
  // Efectivo
  const ef = $("efectivo");
  ef.innerHTML = (appdata.portfolio.efectivo || []).map((e) => escapeHtml(e.label) + ": " + dineroUsd(e.usd, 2)).join("<br>");
}

function renderRealizadas() {
  const { appdata } = datosCache();
  const cont = $("lista-realizadas");
  const resumen = $("resumen-realizadas");
  cont.innerHTML = "";
  resumen.innerHTML = "";
  const select = $("anio-realizadas");
  // Selector de año: por defecto el año actual (E21)
  if (select.options.length <= 1) {
    const anioActual = String(new Date().getFullYear());
    const o = document.createElement("option"); o.value = anioActual; o.textContent = anioActual; select.appendChild(o);
    const optTodo = document.createElement("option"); optTodo.value = "Todo"; optTodo.textContent = "Todo"; select.appendChild(optTodo);
    select.value = anioActual;
  }
  if (!appdata || appdata.realizadas === null || appdata.realizadas === undefined) {
    const m = appdata && appdata.realizadas_motivo ? appdata.realizadas_motivo : "hoja Realizadas ausente";
    resumen.innerHTML = '<p class="null-msg">sin datos (' + escapeHtml(m) + "). Agregá la hoja Realizadas al Excel con la plantilla scripts/app/plantilla_realizadas.csv.</p>";
    return;
  }
  const rt = realizadoTotales(appdata.realizadas);
  resumen.innerHTML =
    '<p><strong>Total realizado:</strong> ' + dineroUsd(rt.totalUsd, 0) + '</p>' +
    '<p><strong>Ganancias:</strong> <span class="pos">' + dineroUsd(rt.ganancias, 0) + '</span> · <strong>Pérdidas:</strong> <span class="neg">' + dineroUsd(rt.perdidas, 0) + '</span> · <strong>Dividendos:</strong> ' + dineroUsd(rt.dividendosUsd, 0) + '</p>' +
    '<p><strong>Operaciones:</strong> ' + rt.filasValidas + (rt.filasExcluidas ? ' · excluidas ' + rt.filasExcluidas : "") + '</p>' +
    '<p><strong>Por motivo:</strong> ' + Object.entries(rt.porMotivo).map(([k, v]) => k + ": " + dineroUsd(v, 0)).join(" · ") + '</p>';
  const anioSel = select.value;
  const filas = (appdata.realizadas.filas || []).filter((f) => anioSel === "Todo" || String(f.fecha || "").slice(0, 4) === anioSel);
  for (const f of filas) {
    const flags = f.flags || [];
    const tr = document.createElement("tr");
    tr.className = flags.length ? "flagged" : "";
    tr.innerHTML =
      '<td>' + escapeHtml(f.fecha) + '</td>' +
      '<td>' + escapeHtml(f.ticker) + '</td>' +
      '<td>' + escapeHtml(f.tipo) + '</td>' +
      '<td>' + (esNumero(f.cant) ? formatAR(f.cant, 2) : "0") + '</td>' +
      '<td>' + dineroUsd(f.ingreso_neto_usd, 2) + '</td>' +
      '<td>' + dineroUsd(f.costo_usd, 2) + '</td>' +
      '<td>' + dineroUsd(f.comisiones_usd, 2) + '</td>' +
      '<td class="' + dineroClass(f.resultado_usd) + '">' + dineroUsd(f.resultado_usd, 2) + '</td>' +
      '<td>' + escapeHtml(f.motivo) + (flags.length ? ' <span class="marca flags">' + flags.join(" · ") + '</span>' : "") + '</td>';
    cont.appendChild(tr);
  }
}

function renderNewsletter() {
  const { appdata } = datosCache();
  const cont = $("contenido-newsletter");
  cont.innerHTML = "";
  if (!appdata || !appdata.newsletter) {
    const m = appdata && appdata.newsletter ? appdata.newsletter.motivo : "no disponible";
    cont.innerHTML = '<p class="null-msg">Newsletter sin datos (' + escapeHtml(m) + ").</p>";
    return;
  }
  const nl = appdata.newsletter;
  // E19: si DOMPurify no cargó, se muestra como texto plano (textContent).
  const html = (md) => {
    if (estado.vendors.dompurify !== "loaded") return null;
    const raw = window.marked ? window.marked.parse(md || "") : (md || "");
    return window.DOMPurify ? window.DOMPurify.sanitize(raw) : null;
  };
  if (nl.digest_md) {
    const h = html(nl.digest_md);
    const sec = document.createElement("section");
    const h3 = document.createElement("h3"); h3.textContent = "Digest " + (nl.digest_file || "");
    sec.appendChild(h3);
    if (h === null) { const p = document.createElement("pre"); p.className = "plain-md"; p.textContent = nl.digest_md; sec.appendChild(p); }
    else { const div = document.createElement("div"); div.innerHTML = h; sec.appendChild(div); }
    cont.appendChild(sec);
  }
  if (nl.vigilancia_md) {
    const h = html(nl.vigilancia_md);
    const sec = document.createElement("section");
    const h3 = document.createElement("h3"); h3.textContent = "Vigilancia " + (nl.vigilancia_file || "");
    sec.appendChild(h3);
    if (h === null) { const p = document.createElement("pre"); p.className = "plain-md"; p.textContent = nl.vigilancia_md; sec.appendChild(p); }
    else { const div = document.createElement("div"); div.innerHTML = h; sec.appendChild(div); }
    cont.appendChild(sec);
  }
}

// ---------- App ----------
function cargarScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve("loaded");
    s.onerror = () => reject(new Error("no cargo " + src));
    document.head.appendChild(s);
  });
}

async function initApp() {
  cargarEstado();
  // E19: vendors con allSettled; la cartera funciona aunque falle el newsletter.
  const resultados = await Promise.allSettled([
    cargarScript("vendor/marked.min.js"),
    cargarScript("vendor/dompurify.min.js"),
  ]);
  estado.vendors = {
    marked: resultados[0].status === "fulfilled" ? "loaded" : "failed",
    dompurify: resultados[1].status === "fulfilled" ? "loaded" : "failed",
  };
  registrarServiceWorker();
  setupUI();
  await sincronizar();
  render();
  bannerSinc();
  programarPoll();
}

function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  fetch("build-id.txt").then((r) => (r.ok ? r.text() : "dev")).catch(() => "dev").then((id) => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      if (reg.active) reg.active.postMessage({ type: "SET_BUILD", build: id.trim() });
    }).catch(() => {});
  });
}

function setBtnLoading(b, loading) {
  if (b) { b.disabled = loading; b.textContent = loading ? "Verificando…" : "Verificar ahora"; }
}

function setupUI() {
  $("btn-portfolio").addEventListener("click", () => { estado.screen = "portfolio"; navActivo("portfolio"); render(); });
  $("btn-realizadas").addEventListener("click", () => { estado.screen = "realizadas"; navActivo("realizadas"); renderRealizadas(); });
  $("btn-newsletter").addEventListener("click", () => { estado.screen = "newsletter"; navActivo("newsletter"); renderNewsletter(); });
  $("btn-config").addEventListener("click", () => { estado.screen = "config"; navActivo("config"); renderConfig(); });
  $("anio-realizadas").addEventListener("change", renderRealizadas);
  $("th-orden").addEventListener("click", () => { estado.sortAsc = !estado.sortAsc; renderPortfolio(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { sincronizar().then(() => { render(); bannerSinc(); }); programarPoll(); }
  });
  window.addEventListener("online", () => { estado.online = true; sincronizar().then(() => { render(); bannerSinc(); }); });
  window.addEventListener("offline", () => { estado.online = false; bannerSinc(); });
}

function navActivo(screen) {
  for (const s of ["portfolio", "realizadas", "newsletter", "config"]) {
    $("btn-" + s).classList.toggle("activo", s === screen);
    $("panel-" + s).classList.toggle("oculto", s !== screen);
  }
}

function render() {
  navActivo(estado.screen);
  renderPortfolio();
  bannerSinc();
}

function renderConfig() {
  $("panel-config").innerHTML =
    '<h2>Configuración</h2>' +
    '<p><label>Token de GitHub (solo lectura, Contents)</label><br>' +
    '<input type="password" id="input-token" placeholder="pega el token"></p>' +
    '<p><label>Vencimiento (opcional, ISO-8601; si se vacía se usa carga + 85 días)</label><br>' +
    '<input type="text" id="input-expiry" placeholder="2027-01-15T00:00:00Z"></p>' +
    '<p><button id="btn-guardar-token">Guardar token</button> <button id="btn-verificar">Verificar ahora</button> <button id="btn-borrar-token">Borrar token</button></p>' +
    '<p id="estado-token"></p>' +
    '<p><strong>Versión:</strong> ' + APP_VERSION + '</p>' +
    '<p class="riesgo"><strong>Riesgo residual:</strong> un token filtrado permite LEER TODO pipeline-bursatil (Excel, mesa/, out/) hasta que venza o se revoque. Es revocable al instante.</p>';
  const et = $("estado-token");
  if (estado.token) {
    et.innerHTML = '<span class="ok">Token cargado</span>' + (estado.expiry ? ' · vence ' + estado.expiry.slice(0,10) : '');
  } else {
    et.innerHTML = '<span class="warn">Sin token</span>';
  }
  $("btn-guardar-token").addEventListener("click", () => {
    const t = $("input-token").value.trim();
    if (!t) return;
    const exp = $("input-expiry").value.trim() || null;
    guardarToken(t, exp);
    $("input-token").value = "";
    renderConfig();
    setTimeout(async () => { await sincronizar(); render(); bannerSinc(); }, 100);
  });
  $("btn-verificar").addEventListener("click", async () => {
    setBtnLoading($("btn-verificar"), true);
    await sincronizar();
    render();
    bannerSinc();
    setBtnLoading($("btn-verificar"), false);
  });
  $("btn-borrar-token").addEventListener("click", () => { borrarToken(); renderConfig(); render(); bannerSinc(); });
}

function programarPoll() {
  if (estado._poll) clearInterval(estado._poll);
  if (document.visibilityState !== "visible") return;
  estado._poll = setInterval(async () => {
    if (document.visibilityState !== "visible") return;
    await sincronizar();
    render();
    bannerSinc();
  }, 5 * 60 * 1000);
}

initApp();
