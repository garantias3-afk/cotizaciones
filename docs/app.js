// app.js — UI y sincronización de la PWA. CSP: sin inline, sin eval.
import { APP_VERSION, esNumero, formatAR, formatUSD0, formatUSD2, valorVivo, pnlNoRealizado, pnlNoRealizadoPct, usaValorcierre, realizadoTotales, totalGeneral, pesosVivos, ordenarPorValorVivo, antiguedadHs } from "./calc.js";

const API_BASE = "https://api.github.com/repos/garantias3-afk/pipeline-bursatil/contents";
const REF = "app-data";
const FILES = ["app-data.json", "precios.json"];
const TOKEN_KEY = "cotizaciones_token";
const EXPIRY_KEY = "cotizaciones_token_expiry";
const CACHE_KEY = "cotizaciones_cache";

const estado = {
  token: null,
  expiry: null,
  cache: {}, // file -> {sha, json, fetched_at}
  screen: "portfolio",
  sortAsc: false,
  error: null,
  online: true,
};

const els = {};
function $(id) { return document.getElementById(id); }

function log(msg) { /* token nunca se registra */ }

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
  estado.expiry = expiry;
  localStorage.setItem(TOKEN_KEY, token);
  if (expiry) localStorage.setItem(EXPIRY_KEY, expiry);
  else localStorage.removeItem(EXPIRY_KEY);
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
  const resultados = {};
  for (const file of FILES) {
    const prev = estado.cache[file];
    const res = await fetchFile(file);
    resultados[file] = res;
    if (!res.ok && (res.error === "TOKEN_EXPIRADO" || res.error === "AUSENTE" || res.error === "ESCHEMA_INVALIDO")) {
      estado.sincError = res.error;
    }
    if (res.ok) {
      if (prev && prev.sha === res.sha) {
        // no reprocesar: mantener json previo pero actualizar fetched_at de referencia
        res.json = prev.json;
      } else {
        let valido = true;
        if (file === "precios.json" && !validarPrecios(res.json)) valido = false;
        if (file === "app-data.json" && !validarAppData(res.json)) valido = false;
        if (!valido) {
          res.ok = false;
          res.error = "ESCHEMA_INVALIDO";
        } else {
          estado.cache[file] = { sha: res.sha, json: res.json, fetched_at: res.fetched_at };
          guardarEstado();
        }
      }
    }
  }
  return resultados;
}

function datosCache() {
  const precios = estado.cache["precios.json"] ? estado.cache["precios.json"].json : null;
  const appdata = estado.cache["app-data.json"] ? estado.cache["app-data.json"].json : null;
  return { precios, appdata };
}

function fuenteHumana(p) {
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
  if (!esNumero(v)) return "N/D";
  return decimales === 2 ? formatUSD2(v) : formatUSD0(v);
}

// ---------- Render ----------
function bannerSinc() {
  const el = $("banner-sinc");
  if (!el) return;
  const { precios, appdata } = datosCache();
  const ahora = new Date();
  if (!estado.token) { el.textContent = "Configurá el token"; el.className = "banner token"; return; }
  if (estado.sincError === "TOKEN_EXPIRADO") { el.textContent = "TOKEN EXPIRADO — regenerar"; el.className = "banner token"; return; }
  if (estado.sincError === "AUSENTE") { el.textContent = "Archivo de datos ausente"; el.className = "banner token"; return; }
  if (estado.sincError === "ESCHEMA_INVALIDO") { el.textContent = "DATOS INVÁLIDOS"; el.className = "banner token"; return; }
  // estado de conexión
  if (!navigator.onLine) {
    const pf = estado.cache["precios.json"];
    const t = pf ? pf.fetched_at : "";
    el.textContent = "SIN CONEXIÓN — datos de " + (t ? t.slice(0,16).replace("T"," ") : "nunca");
    el.className = "banner sinconexion";
    return;
  }
  // token expirado?
  if (estado.expiry && new Date(estado.expiry) < ahora) {
    el.textContent = "TOKEN EXPIRADO — regenerar";
    el.className = "banner token";
    return;
  }
  if (precios) {
    const fa = precios.fetched_at || "";
    el.textContent = "Cartera actualizada " + fa.slice(0,16).replace("T"," ") + " · sha " + (precios.sha || "").slice(0,7);
    el.className = "banner ok";
  } else if (appdata) {
    el.textContent = "Cartera actualizada · datos de app-data";
    el.className = "banner ok";
  } else {
    el.textContent = "Configurá el token";
    el.className = "banner token";
  }
}

function dineroClass(v) {
  if (!esNumero(v)) return "neutro";
  return v > 0 ? "pos" : (v < 0 ? "neg" : "neutro");
}

function renderPortfolio() {
  const { precios, appdata } = datosCache();
  const cont = $("lista-portfolio");
  cont.innerHTML = "";
  if (!appdata) {
    $("tot-valor-vivo").textContent = "N/D";
    $("tot-pnl").textContent = "N/D";
    $("tot-realizado").textContent = "N/D";
    $("tot-general").textContent = "N/D";
    $("tot-cierre").textContent = appdata ? (appdata.portfolio.fecha_cierre_excel || "sin fecha") : "sin datos";
    return;
  }
  const port = appdata.portfolio;
  const precMap = (precios && precios.precios) || {};
  const unidadSospechosa = (appdata.checks && appdata.checks.unidad_sospechosa) || [];
  let valorVivoTotal = 0, pnlTotal = 0, costoTotal = 0;
  const filas = [];
  for (const pos of port.tickers) {
    const p = precMap[pos.ticker];
    const precio = p && esNumero(p.price_usd) ? p.price_usd : null;
    const vivo = valorVivo(pos, precio);
    const usaVC = usaValorcierre(p ? p.source : null, p ? p.ratio_ok : null, unidadSospechosa, pos.ticker);
    const valorRef = usaVC ? pos.valor_cierre : vivo;
    const costo = esNumero(pos.costo_usd) ? pos.costo_usd : 0;
    const pnl = pnlNoRealizado(valorRef, costo);
    filas.push({ ...pos, precio, vivo, valorRef, costo, pnl, usaVC, source: p ? p.source : null, ts: p ? p.ts : null, ratio_ok: p ? p.ratio_ok : null });
    if (esNumero(valorRef)) valorVivoTotal += valorRef;
    if (esNumero(pnl)) pnlTotal += pnl;
    if (esNumero(pos.costo_usd)) costoTotal += pos.costo_usd;
  }
  const ordenadas = ordenarPorValorVivo(filas, estado.sortAsc);
  const pesos = pesosVivos(ordenadas);
  for (let i = 0; i < ordenadas.length; i++) {
    const f = ordenadas[i];
    const tr = document.createElement("tr");
    const vivoDisp = esNumero(f.valorRef) ? f.valorRef : 0;
    const pct = pesos[i];
    const pnlCls = dineroClass(f.pnl);
    const marca = [];
    if (f.source === "NO_VERIFICADO") marca.push("NO VERIFICADO");
    if (f.ratio_ok === false) marca.push("RATIO SOSPECHOSO");
    if (unidadSospechosa.includes(f.ticker)) marca.push("⚠ unidad");
    if (f.ratio_ok === null && f.instrumento === "CEDEAR") marca.push("ratio sin control");
    tr.innerHTML =
      '<td class="ticker"><strong>' + escapeHtml(f.ticker) + '</strong>' + (marca.length ? '<br><span class="marca">' + marca.join(" · ") + '</span>' : "") + '</td>' +
      '<td>' + (esNumero(f.cant) ? formatAR(f.cant, 2) : "—") + '</td>' +
      '<td>' + (esNumero(f.precio) ? formatUSD2(f.precio) : "—") + ' <span class="badge badge-' + (f.source || "des").toLowerCase() + '">' + fuenteHumana(f || {}) + '</span> <span class="edad">' + edadHumana(f.ts) + '</span></td>' +
      '<td class="' + dineroClass(f.valorRef) + '">' + dineroUsd(f.valorRef, 0) + (f.usaVC ? ' <span class="marca vc">Excel</span>' : "") + '</td>' +
      '<td class="' + pnlCls + '">' + dineroUsd(f.pnl, 0) + ' <span class="pnl-pct">' + (pnlNoRealizadoPct(f.pnl, f.costo) === null ? "" : formatAR(pnlNoRealizadoPct(f.pnl, f.costo), 2) + "%") + '</span></td>' +
      '<td>' + formatAR(pct, 2) + "%</td>";
    cont.appendChild(tr);
  }
  const efectivoUsd = port.efectivo ? port.efectivo.reduce((a, e) => a + (esNumero(e.usd) ? e.usd : 0), 0) : 0;
  const gen = totalGeneral(valorVivoTotal, pnlTotal, 0, efectivoUsd);
  $("tot-valor-vivo").textContent = dineroUsd(valorVivoTotal, 0);
  $("tot-pnl").textContent = dineroUsd(pnlTotal, 0);
  $("tot-realizado").textContent = dineroUsd(0, 0);
  $("tot-general").textContent = dineroUsd(gen, 0);
  $("tot-cierre").textContent = dineroUsd(port.total_tenencias, 0) + " · " + (port.fecha_cierre_excel || "sin fecha");
}

function renderRealizadas() {
  const { appdata } = datosCache();
  const cont = $("lista-realizadas");
  const resumen = $("resumen-realizadas");
  cont.innerHTML = "";
  resumen.innerHTML = "";
  if (!appdata || !appdata.realizadas) {
    const m = appdata && appdata.realizadas ? appdata.realizadas.motivo_null : "hoja Realizadas ausente";
    resumen.innerHTML = '<p class="null-msg">sin datos (' + escapeHtml(m) + "). Agregá la hoja Realizadas al Excel con la plantilla scripts/app/plantilla_realizadas.csv.</p>";
    return;
  }
  const rt = realizadoTotales(appdata.realizadas);
  resumen.innerHTML =
    '<p><strong>Total realizado:</strong> ' + dineroUsd(rt.totalUsd, 0) + '</p>' +
    '<p><strong>Ganancias:</strong> <span class="pos">' + dineroUsd(rt.ganancias, 0) + '</span> · <strong>Pérdidas:</strong> <span class="neg">' + dineroUsd(rt.perdidas, 0) + '</span> · <strong>Dividendos:</strong> ' + dineroUsd(rt.dividendosUsd, 0) + '</p>' +
    '<p><strong>Operaciones:</strong> ' + rt.filasValidas + (rt.filasExcluidas ? ' · excluidas ' + rt.filasExcluidas : "") + '</p>' +
    '<p><strong>Por motivo:</strong> ' + Object.entries(rt.porMotivo).map(([k, v]) => k + ": " + dineroUsd(v, 0)).join(" · ") + '</p>';
  const anioSel = $("anio-realizadas").value;
  const select = $("anio-realizadas");
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
  // años
  const anos = new Set();
  for (const f of appdata.realizadas.filas || []) {
    const a = String(f.fecha || "").slice(0, 4);
    if (a) anos.add(a);
  }
  while (select.options.length > 1) select.remove(1);
  for (const a of [...anos].sort()) {
    const o = document.createElement("option"); o.value = a; o.textContent = a; select.appendChild(o);
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
  if (nl.digest_md) {
    cont.innerHTML += '<section><h3>Digest ' + escapeHtml(nl.digest_file || "") + '</h3>' + sanitizarHtml(nl.digest_md) + '</section>';
  }
  if (nl.vigilancia_md) {
    cont.innerHTML += '<section><h3>Vigilancia ' + escapeHtml(nl.vigilancia_file || "") + '</h3>' + sanitizarHtml(nl.vigilancia_md) + '</section>';
  }
}

function sanitizarHtml(md) {
  const html = window.marked ? window.marked.parse(md || "") : (md || "");
  return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

// ---------- App ----------
async function initApp() {
  cargarEstado();
  window.marked = null;
  window.DOMPurify = null;
  // cargar vendor
  await Promise.all([
    cargarScript("vendor/marked.min.js").then(() => { window.marked = window.marked; }),
    cargarScript("vendor/dompurify.min.js").then(() => { window.DOMPurify = window.DOMPurify; }),
  ]);
  setupUI();
  await sincronizar();
  render();
  bannerSinc();
  programarPoll();
}

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function setupUI() {
  // Nav estática (existe en el HTML).
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

function setBtnLoading(b, loading) {
  if (b) { b.disabled = loading; b.textContent = loading ? "Verificando…" : "Verificar ahora"; }
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
    '<p><label>Vencimiento (opcional, ISO-8601)</label><br>' +
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
    guardarToken(t, null);
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
