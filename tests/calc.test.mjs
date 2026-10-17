import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const calc = await import("file://" + join(__dirname, "..", "docs", "calc.js"));

const APP = {
  appdata: 5,
  portfolio: {
    tickers: [
      { ticker: "AAA", brokers: "IBKR", instrumento: "CEDEAR", ratio: 2, cant: 10, costo_usd: 100, valor_cierre: 200 },
      { ticker: "BBB", brokers: "IEB", instrumento: "DIRECTA", ratio: null, cant: 5, costo_usd: 50, valor_cierre: 60 },
    ],
    efectivo: [{ label: "Efectivo", usd: 100 }],
    total_tenencias: 160,
    total_general: 260,
    fecha_cierre_excel: "2026-10-13",
  },
  realizadas: null,
  checks: { unidad_sospechosa: [] },
};
const PRECIOS = {
  schema: 4,
  precios: {
    AAA: { price_usd: 10, market: "nASDAQ", source: "IOL", ts: "2026-10-16T20:00:00Z", session_ok: true, ratio_ok: true },
    BBB: { price_usd: 20, market: "nYSE", source: "IOL", ts: "2026-10-16T20:00:00Z", session_ok: true },
  },
};

describe("calc.js (B5)", () => {
  it("CEDEAR = (cant ÷ ratio) × precio; directa = cant × precio", () => {
    assert.strictEqual(calc.valorVivo(APP.portfolio.tickers[0], 10), 50);
    assert.strictEqual(calc.valorVivo(APP.portfolio.tickers[1], 20), 100);
  });

  it("valorVivo devuelve null si falta precio o cant (E14)", () => {
    assert.strictEqual(calc.valorVivo(APP.portfolio.tickers[1], null), null);
    assert.strictEqual(calc.valorVivo({ ...APP.portfolio.tickers[1], cant: null }, 20), null);
  });

  it("armarFilas: valorRef y P&L correctos (usa valorRef, no valorVivo)", () => {
    const filas = calc.armarFilas(APP, PRECIOS);
    const aaa = filas.find((f) => f.ticker === "AAA");
    const bbb = filas.find((f) => f.ticker === "BBB");
    assert.strictEqual(aaa.valorRef, 50);
    assert.strictEqual(bbb.valorRef, 100);
    assert.strictEqual(aaa.pnl, -50);
    assert.strictEqual(bbb.pnl, 50);
    assert.strictEqual(aaa.usaVC, false);
  });

  it("pesos Σ = 100 ±0,01 y ninguno en 0 si todos tienen valor", () => {
    const filas = calc.armarFilas(APP, PRECIOS);
    const pesos = calc.pesosVivos(filas);
    const suma = pesos.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(suma - 100) < 0.01, "suma=" + suma);
    assert.ok(pesos.every((p) => p > 0), "pesos=" + pesos);
  });

  it("orden descendente verificado", () => {
    const filas = calc.armarFilas(APP, PRECIOS);
    const ord = calc.ordenarPorValorVivo(filas);
    assert.strictEqual(ord[0].ticker, "BBB"); // 100 > 50
    assert.strictEqual(ord[1].ticker, "AAA");
  });

  it("TOTAL GENERAL = Σ valor vivo + Σ efectivo (E12, sin doble contar P&L)", () => {
    const filas = calc.armarFilas(APP, PRECIOS);
    const res = calc.resumenPortfolio(filas, APP);
    assert.strictEqual(res.totalVivo, 150);
    assert.strictEqual(res.efectivoUsd, 100);
    assert.strictEqual(res.totalGeneral, 250); // 150 + 100, NO + P&L
    assert.strictEqual(calc.calcTotalGeneral(150, 100), 250);
  });

  it("directa sin precio → usa valor_cierre marcado, no 0", () => {
    const sinPrecio = { schema: 4, precios: { BBB: { price_usd: null, source: "NO_VERIFICADO", session_ok: false } } };
    const filas = calc.armarFilas(APP, sinPrecio);
    const bbb = filas.find((f) => f.ticker === "BBB");
    assert.strictEqual(bbb.usaVC, true);
    assert.strictEqual(bbb.valorRef, 60); // valor_cierre, no 0
  });

  it("ticker ausente en precios.json → usa valor_cierre", () => {
    const sinBbb = { schema: 4, precios: { AAA: PRECIOS.precios.AAA } };
    const filas = calc.armarFilas(APP, sinBbb);
    const bbb = filas.find((f) => f.ticker === "BBB");
    assert.strictEqual(bbb.usaVC, true);
    assert.strictEqual(bbb.valorRef, 60);
  });

  it("session_ok false → usa valor_cierre", () => {
    const stale = { schema: 4, precios: { AAA: { ...PRECIOS.precios.AAA, session_ok: false }, BBB: PRECIOS.precios.BBB } };
    const filas = calc.armarFilas(APP, stale);
    const aaa = filas.find((f) => f.ticker === "AAA");
    assert.strictEqual(aaa.usaVC, true);
    assert.strictEqual(aaa.valorRef, 200);
  });

  it("costo faltante → P&L N/D (null), no ganancia falsa", () => {
    const appSinCosto = JSON.parse(JSON.stringify(APP));
    appSinCosto.portfolio.tickers[0].costo_usd = null;
    const filas = calc.armarFilas(appSinCosto, PRECIOS);
    const aaa = filas.find((f) => f.ticker === "AAA");
    assert.strictEqual(aaa.pnl, null);
    assert.strictEqual(calc.pnlNoRealizado(aaa.valorRef, aaa.costo), null);
  });

  it("realizadas null → realizadoTotales null (no rompe)", () => {
    assert.strictEqual(calc.realizadoTotales(null), null);
    assert.strictEqual(calc.realizadoTotales(APP.realizadas), null);
  });

  it("realizado: suma, filtro por año y exclusión de filas con flag", () => {
    const ok = { filas: [
      { fecha: "2026-03-01", ticker: "AAA", tipo: "VENTA", resultado_usd: 95, motivo: "STOP", flags: [] },
      { fecha: "2025-01-01", ticker: "BBB", tipo: "DIVIDENDO", resultado_usd: 10, motivo: "DIVIDENDO", flags: [] },
      { fecha: "2026-06-01", ticker: "CCC", tipo: "VENTA", resultado_usd: -10, motivo: "TOMA", flags: ["REALIZADA_INCONSISTENTE"] },
    ] };
    const rt = calc.realizadoTotales(ok);
    assert.strictEqual(rt.totalUsd, 105);
    assert.strictEqual(rt.filasExcluidas, 1);
    assert.strictEqual(rt.porAnio["2026"], 95);
  });

  it("formatAR redondea y no trunca (E20)", () => {
    assert.strictEqual(calc.formatAR(1234.6, 0), "1.235");
    assert.strictEqual(calc.formatAR(12.999, 2), "13,00");
    assert.strictEqual(calc.formatAR(1234567.89, 2), "1.234.567,89");
    assert.strictEqual(calc.formatAR(null, 2), "N/D");
  });
});
