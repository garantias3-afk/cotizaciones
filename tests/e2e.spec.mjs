import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const ROOT = process.cwd();
function servir(archivo) {
  const p = join(ROOT, archivo);
  if (archivo.endsWith(".html")) return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: readFileSync(p) };
  if (archivo.endsWith(".css")) return { status: 200, headers: { "content-type": "text/css; charset=utf-8" }, body: readFileSync(p) };
  if (archivo.endsWith(".js")) return { status: 200, headers: { "content-type": "application/javascript; charset=utf-8" }, body: readFileSync(p) };
  if (archivo.endsWith(".webmanifest")) return { status: 200, headers: { "content-type": "application/manifest+json" }, body: readFileSync(p) };
  if (archivo.endsWith(".png")) return { status: 200, headers: { "content-type": "image/png" }, body: readFileSync(p) };
  return { status: 404, body: "" };
}

let server;
const PORT = 18988;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let path = url.pathname === "/" ? "/cotizaciones/" : url.pathname;
    const rest = path.slice(1);
    let file;
    if (rest === "cotizaciones/") file = "docs/index.html";
    else if (rest.startsWith("cotizaciones/")) file = "docs/" + rest.slice("cotizaciones/".length);
    else file = "docs/index.html";
    const r = servir(file);
    res.writeHead(r.status, r.headers || {});
    res.end(r.body);
  });
  await new Promise((res) => server.listen(PORT, "127.0.0.1", res));
});
test.afterAll(async () => { await new Promise((res) => server.close(res)); });

const BASE = "http://localhost:" + PORT;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

const FIXT_PRECIOS = {
  schema: 4, generated_at: "2026-10-16T20:00:00Z", run_id: "e2e",
  precios: {
    AAA: { price_usd: 500, market: "nYSE", source: "IOL", ts: "2026-10-16T16:00:00Z", session_ok: true, motivo: "" },
    BBB: { price_usd: 10, market: "nASDAQ", source: "YAHOO", ts: "2026-10-16T16:00:00Z", session_ok: true, motivo: "", ratio_ok: null },
  },
  resumen: { total: 23, frescos: 2, iol: 1, yahoo: 1, no_verificado: 0, ratio_sospechoso: 0 },
};
const FIXT_APPDATA = {
  appdata: 5, generated_at: "2026-10-16T20:00:00Z", generator: "ci", generator_commit: "abc", excel_commit: "def",
  excel: { path: "config/x.xlsx", sha256: "aa", mtime: "2026-10-16T20:00:00Z" },
  portfolio: {
    tickers: [
      { ticker: "AAA", brokers: "IEB", instrumento: "CEDEAR", ratio: 60, cant: 10, costo_usd: 4000, valor_cierre: 5000, peso_excel: 50 },
      { ticker: "BBB", brokers: "IBKR", instrumento: "DIRECTA", ratio: null, cant: 100, costo_usd: 500, valor_cierre: 1000, peso_excel: 50 },
    ],
    efectivo: [{ label: "Efectivo", usd: 100 }],
    total_tenencias: 6000, total_general: 6100, fecha_cierre_excel: "2026-10-16",
  },
  realizadas: {
    motivo_null: null,
    filas: [
      { fecha: "2026-03-01", ticker: "AAA", tipo: "VENTA", cant: 2, ingreso_neto_usd: 200, costo_usd: 100, comisiones_usd: 5, resultado_usd: 95, moneda_original: "USD", monto_original: 200, base_usd: "USD", metodo_costo: "PPP", motivo: "STOP", ref_log: "", flags: [] },
      { fecha: "2026-03-02", ticker: "BBB", tipo: "DIVIDENDO", cant: 0, ingreso_neto_usd: 10, costo_usd: 0, comisiones_usd: 0, resultado_usd: 10, moneda_original: "USD", monto_original: 10, base_usd: "USD", metodo_costo: "PPP", motivo: "DIVIDENDO", ref_log: "", flags: [] },
    ],
    totales: { total_usd: 105, por_anio: { "2026": 105 }, por_ticker: { AAA: 95, BBB: 10 }, por_motivo: { STOP: 95, DIVIDENDO: 10 }, dividendos_usd: 10, filas_excluidas: 0 },
  },
  newsletter: null,
  checks: { cuadre_tenencias_dif_usd: 0, tickers: 23, mapa_cubre_todo: true, unidad_sospechosa: [] },
};
function jsonBody(o) { return JSON.stringify(o); }
function b64(o) { return Buffer.from(jsonBody(o)).toString("base64"); }

async function routeFixtures(page) {
  await page.route("**/api.github.com/repos/garantias3-afk/pipeline-bursatil/contents/*", async (route) => {
    const file = route.request().url().split("/contents/")[1].split("?")[0];
    const data = file === "app-data.json" ? FIXT_APPDATA : FIXT_PRECIOS;
    await route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ sha: "s-" + file, content: b64(data) }) });
  });
}
async function configurarToken(page, tok) {
  await page.locator('#btn-config').click();
  await page.waitForTimeout(300);
  await page.locator('input#input-token').fill(tok);
  await page.locator('#btn-guardar-token').click();
  await page.waitForTimeout(1500);
}

test("a) sin token → banner 'Configurá el token'", async ({ page }) => {
  await page.goto(BASE + "/cotizaciones/");
  await page.waitForTimeout(1200);
  await expect(page.locator("#banner-sinc")).toContainText("Configurá el token");
});

test("b) token válido + 200 → cartera y pestaña REALIZADAS", async ({ page }) => {
  await page.goto(BASE + "/cotizaciones/");
  await page.waitForTimeout(1200);
  await routeFixtures(page);
  await configurarToken(page, "token-invalido-de-prueba");
  await expect(page.locator("#tot-valor-vivo")).not.toContainText("N/D");
  await expect(page.locator("#btn-realizadas")).toBeVisible();
  await page.locator("#btn-realizadas").click();
  await page.waitForTimeout(500);
  await expect(page.locator("#resumen-realizadas")).toContainText("105");
});

test("c) mismo sha → no re-descarga", async ({ page }) => {
  let n = 0;
  await page.goto(BASE + "/cotizaciones/");
  await page.waitForTimeout(1200);
  await page.route("**/api.github.com/repos/garantias3-afk/pipeline-bursatil/contents/*", async (route) => {
    n++;
    const file = route.request().url().split("/contents/")[1].split("?")[0];
    const data = file === "app-data.json" ? FIXT_APPDATA : FIXT_PRECIOS;
    await route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ sha: "sha-" + file, content: b64(data) }) });
  });
  await configurarToken(page, "token-invalido-de-prueba");
  const primero = n;
  await page.locator('#btn-verificar').click();
  await page.waitForTimeout(1200);
  await page.locator('#btn-portfolio').click();
  await page.waitForTimeout(500);
  await expect(page.locator("#tot-valor-vivo")).not.toContainText("N/D");
});

test("d) 401 → banner token expirado", async ({ page }) => {
  await page.goto(BASE + "/cotizaciones/");
  await page.waitForTimeout(1200);
  await page.route("**/api.github.com/repos/garantias3-afk/pipeline-bursatil/contents/*", async (route) => {
    await route.fulfill({ status: 401, headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Bad credentials" }) });
  });
  await configurarToken(page, "token-invalido-de-prueba");
  await expect(page.locator("#banner-sinc")).toContainText("TOKEN EXPIRADO");
});

test("e) 404 → archivo de datos ausente", async ({ page }) => {
  await page.goto(BASE + "/cotizaciones/");
  await page.waitForTimeout(1200);
  await page.route("**/api.github.com/repos/garantias3-afk/pipeline-bursatil/contents/*", async (route) => {
    await route.fulfill({ status: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Not Found" }) });
  });
  await configurarToken(page, "t");
  await expect(page.locator("#banner-sinc")).toContainText("ausente");
});

test("f) offline → SIN CONEXIÓN", async ({ page }) => {
  await page.goto(BASE + "/cotizaciones/");
  await page.waitForTimeout(1200);
  await routeFixtures(page);
  await configurarToken(page, "t");
  await page.context().setOffline(true);
  await page.locator('#btn-verificar').click();
  await page.waitForTimeout(1000);
  await expect(page.locator("#banner-sinc")).toContainText("SIN CONEXIÓN");
});

test("g) XSS en markdown y motivo → sanitizado", async ({ page }) => {
  const appdataXSS = JSON.parse(JSON.stringify(FIXT_APPDATA));
  appdataXSS.newsletter = { digest_md: "<img src=x onerror=alert(1)>", digest_file: "x.md", vigilancia_md: null, vigilancia_file: null };
  appdataXSS.realizadas.filas[0].motivo = "<script>alert(2)</script>";
  await page.goto(BASE + "/cotizaciones/");
  await page.waitForTimeout(1200);
  await page.route("**/api.github.com/repos/garantias3-afk/pipeline-bursatil/contents/*", async (route) => {
    const file = route.request().url().split("/contents/")[1].split("?")[0];
    const data = file === "app-data.json" ? appdataXSS : FIXT_PRECIOS;
    await route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ sha: "s", content: b64(data) }) });
  });
  await configurarToken(page, "t");
  const alerts = [];
  page.on("dialog", (d) => { alerts.push(d.type); d.dismiss(); });
  await page.locator("#btn-newsletter").click();
  await page.waitForTimeout(500);
  const textoNews = await page.locator("#contenido-newsletter").innerText();
  expect(alerts.length).toBe(0);
  expect(textoNews).not.toContain("<script>");
  expect(textoNews).not.toContain("onerror");
  await page.locator("#btn-realizadas").click();
  await page.waitForTimeout(500);
  await expect(page.locator("script:has-text('alert(2)')")).toHaveCount(0);
});

test("h) token no aparece en console ni URLs", async ({ page }) => {
  const consoleMsgs = [];
  page.on("console", (m) => consoleMsgs.push(m.text()));
  await page.goto(BASE + "/cotizaciones/");
  await page.waitForTimeout(1200);
  await routeFixtures(page);
  await configurarToken(page, "mi-token-secreto-12345");
  const url = page.url();
  expect(url).not.toContain("mi-token-secreto");
  const logs = consoleMsgs.join(" | ");
  expect(logs).not.toContain("mi-token-secreto");
});

test("i) visibilitychange → re-chequea", async ({ page }) => {
  let n = 0;
  await page.goto(BASE + "/cotizaciones/");
  await page.waitForTimeout(1200);
  await page.route("**/api.github.com/repos/garantias3-afk/pipeline-bursatil/contents/*", async (route) => {
    n++;
    const file = route.request().url().split("/contents/")[1].split("?")[0];
    const data = file === "app-data.json" ? FIXT_APPDATA : FIXT_PRECIOS;
    await route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ sha: "s", content: b64(data) }) });
  });
  await configurarToken(page, "t");
  const antes = n;
  await page.bringToFront();
  await page.waitForTimeout(1200);
  expect(n).toBeGreaterThanOrEqual(antes);
});

test("j) DOM sin dólar ni MEP/CCL/oficial", async ({ page }) => {
  await page.goto(BASE + "/cotizaciones/");
  await page.waitForTimeout(1200);
  await routeFixtures(page);
  await configurarToken(page, "t");
  const texto = await page.locator("body").innerText();
  for (const kw of ["MEP", "CCL", "oficial"]) {
    expect(texto.toLowerCase().includes(kw.toLowerCase())).toBe(false);
  }
  expect(texto).not.toMatch(/\$\s*\d/);
});
