// calc.js — Módulo ES puro, sin DOM. Testeable con `node --test`.
// Valoración SIN tipo de cambio: CEDEAR = (cant ÷ ratio) × precio_usd del subyacente;
// directa = cant × precio_usd. Un único nombre de propiedad: `valorRef`.

export const APP_VERSION = "1.0.0-v5";

export function esNumero(v) {
  return typeof v === "number" && Number.isFinite(v);
}

// Formato es-AR con redondeo correcto (E20).
export function formatAR(value, decimales = 2) {
  if (!esNumero(value)) return "N/D";
  const neg = value < 0;
  const abs = Math.abs(value);
  const s = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(abs);
  return (neg ? "-" : "") + s;
}

export function formatUSD2(value) {
  return formatAR(value, 2);
}

export function formatUSD0(value) {
  return formatAR(value, 0);
}

// Valor vivo de una posición. Devuelve null si falta precio o cant (E14).
export function valorVivo(position, precioUsd) {
  if (!position || !esNumero(position.cant) || !esNumero(precioUsd)) return null;
  if (position.instrumento === "CEDEAR") {
    const ratio = esNumero(position.ratio) && position.ratio !== 0 ? position.ratio : null;
    if (!ratio) return null;
    return (position.cant / ratio) * precioUsd;
  }
  return position.cant * precioUsd;
}

// ¿Usa valor_cierre del Excel? (E14): precio ausente, ticker sin precio, session_ok false,
// NO_VERIFICADO, RATIO_SOSPECHOSO o UNIDAD_SOSPECHOSA.
export function usaValorcierre(priceUsd, source, ratioOk, sessionOk, unidadSospechosa, ticker, existePrecio) {
  if (!existePrecio) return true;
  if (!esNumero(priceUsd)) return true;
  if (source === "NO_VERIFICADO") return true;
  if (sessionOk === false) return true;
  if (ratioOk === false) return true;
  if (unidadSospechosa && unidadSospechosa.includes(ticker)) return true;
  return false;
}

// P&L no realizado = vivo − costo. Null si falta vivo o costo (E14).
export function pnlNoRealizado(vivo, costoUsd) {
  if (!esNumero(vivo) || !esNumero(costoUsd)) return null;
  return vivo - costoUsd;
}

export function pnlNoRealizadoPct(pnl, costoUsd) {
  if (!esNumero(pnl) || !esNumero(costoUsd) || costoUsd === 0) return null;
  return (pnl / costoUsd) * 100;
}

// P&L realizado: filas válidas (sin flags), suma y agregados.
export function realizadoTotales(realizadas) {
  if (!realizadas) return null;
  const filas = (realizadas.filas || []).filter((f) => !f.flags || f.flags.length === 0);
  const total = filas.reduce((a, f) => a + (esNumero(f.resultado_usd) ? f.resultado_usd : 0), 0);
  const porAnio = {};
  const porTicker = {};
  const porMotivo = {};
  let dividendos = 0;
  for (const f of filas) {
    const res = esNumero(f.resultado_usd) ? f.resultado_usd : 0;
    const anio = String(f.fecha || "").slice(0, 4) || "?";
    porAnio[anio] = (porAnio[anio] || 0) + res;
    porTicker[f.ticker] = (porTicker[f.ticker] || 0) + res;
    if (f.motivo) porMotivo[f.motivo] = (porMotivo[f.motivo] || 0) + res;
    if (f.tipo === "DIVIDENDO") dividendos += res;
  }
  const ganancias = filas.filter((f) => (esNumero(f.resultado_usd) ? f.resultado_usd : 0) > 0).reduce((a, f) => a + f.resultado_usd, 0);
  const perdidas = filas.filter((f) => (esNumero(f.resultado_usd) ? f.resultado_usd : 0) < 0).reduce((a, f) => a + f.resultado_usd, 0);
  return {
    filasValidas: filas.length,
    totalUsd: total,
    porAnio,
    porTicker,
    porMotivo,
    dividendosUsd: dividendos,
    ganancias,
    perdidas,
    filasExcluidas: (realizadas.filas || []).length - filas.length,
  };
}

// TOTAL GENERAL = Σ valor vivo + Σ efectivo (E12: el P&L no realizado NO se suma; el realizado
// ya es caja dentro del efectivo y se muestra aparte).
export function calcTotalGeneral(valorVivoTotal, efectivoUsd) {
  const vivo = esNumero(valorVivoTotal) ? valorVivoTotal : 0;
  const efec = esNumero(efectivoUsd) ? efectivoUsd : 0;
  return vivo + efec;
}

// Pesos vivos: cada fila / total vivo. Debe dar 100% ± 0.01 (usa `valorRef`, E13).
export function pesosVivos(filas) {
  const total = filas.reduce((a, p) => a + (esNumero(p.valorRef) ? p.valorRef : 0), 0);
  if (total === 0) return filas.map(() => 0);
  return filas.map((p) => ((esNumero(p.valorRef) ? p.valorRef : 0) / total) * 100);
}

// Ordenar filas por valorRef descendente (E13).
export function ordenarPorValorVivo(filas, asc = false) {
  return [...filas].sort((a, b) => {
    const va = esNumero(a.valorRef) ? a.valorRef : 0;
    const vb = esNumero(b.valorRef) ? b.valorRef : 0;
    return asc ? va - vb : vb - va;
  });
}

// Arma las filas EXACTAMENTE como las consume la UI (E13). Usada por app.js y por los tests.
export function armarFilas(appdata, precios) {
  const preciosMap = (precios && precios.precios) || {};
  const unidadSospechosa = (appdata && appdata.checks && appdata.checks.unidad_sospechosa) || [];
  const filas = [];
  for (const pos of (appdata?.portfolio?.tickers || [])) {
    const p = preciosMap[pos.ticker];
    const existePrecio = !!p;
    const priceUsd = p && esNumero(p.price_usd) ? p.price_usd : null;
    const source = p ? p.source : null;
    const sessionOk = p ? p.session_ok : null;
    const ratioOk = p ? p.ratio_ok : null;
    const usaVC = usaValorcierre(priceUsd, source, ratioOk, sessionOk, unidadSospechosa, pos.ticker, existePrecio);
    const vivo = valorVivo(pos, priceUsd);
    let valorRef = usaVC ? pos.valor_cierre : vivo;
    if (!esNumero(valorRef)) valorRef = null;
    const costo = esNumero(pos.costo_usd) ? pos.costo_usd : null;
    const pnl = pnlNoRealizado(valorRef, costo);
    filas.push({
      ticker: pos.ticker,
      cant: pos.cant,
      instrumento: pos.instrumento,
      ratio: pos.ratio,
      brokers: pos.brokers,
      precio: priceUsd,
      source,
      ts: p ? p.ts : null,
      sessionOk,
      ratioOk,
      vivo,
      valorRef,
      costo,
      pnl,
      usaVC,
    });
  }
  return filas;
}

// Resumen de cartera (E12/E14/E15).
export function resumenPortfolio(filas, appdata) {
  const totalVivo = filas.reduce((a, f) => a + (esNumero(f.valorRef) ? f.valorRef : 0), 0);
  const pnlTotal = filas.reduce((a, f) => a + (esNumero(f.pnl) ? f.pnl : 0), 0);
  const costoTotal = filas.reduce((a, f) => a + (esNumero(f.costo) ? f.costo : 0), 0);
  const efectivoUsd = (appdata?.portfolio?.efectivo || []).reduce((a, e) => a + (esNumero(e.usd) ? e.usd : 0), 0);
  const totalCierre = esNumero(appdata?.portfolio?.total_tenencias) ? appdata.portfolio.total_tenencias : null;
  const delta = esNumero(totalCierre) ? totalVivo - totalCierre : null;
  const deltaPct = esNumero(delta) && esNumero(totalCierre) && totalCierre !== 0 ? (delta / totalCierre) * 100 : null;
  const pnlPct = esNumero(pnlTotal) && esNumero(costoTotal) && costoTotal !== 0 ? (pnlTotal / costoTotal) * 100 : null;
  return {
    totalVivo,
    pnlTotal,
    costoTotal,
    efectivoUsd,
    totalCierre,
    delta,
    deltaPct,
    pnlPct,
    totalGeneral: calcTotalGeneral(totalVivo, efectivoUsd),
  };
}

export function antiguedadHs(tsIso) {
  if (!tsIso) return null;
  const d = new Date(tsIso);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / 3600000;
}
