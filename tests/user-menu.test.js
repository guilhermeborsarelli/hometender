import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

let browser, server, origin;
before(async () => {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['tools/serve.mjs', 'app', String(port)], {stdio: 'pipe'});
  for (let n = 0; ; n++) {
    try { if ((await fetch(origin, {signal: AbortSignal.timeout(1000)})).ok) break; } catch { /* aguarda o servidor */ }
    if (n >= 50 || server.exitCode != null) throw new Error('O servidor do app não iniciou.');
    await delay(100);
  }
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)});
});
after(async () => { await browser?.close(); server?.kill(); });

async function openPage(t, viewport = {width: 1280, height: 900}) {
  const context = await browser.newContext({viewport});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // As fontes remotas não fazem parte destes testes de interação.
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(() => localStorage.setItem('hometender.lang', JSON.stringify('pt')));
  await page.goto(origin, {waitUntil: 'domcontentloaded'});
  t.after(() => assert.deepEqual(errors, [], 'sem erros JavaScript'));
  return page;
}
async function guest(page) {
  await page.locator('#dev-enter').click();
  await page.locator('#shell').waitFor({state: 'visible'});
}
async function register(page, name, email) {
  await page.locator('[data-mode="register"]').click();
  await page.locator('[name="name"]').fill(name);
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill('senha-de-teste');
  await page.locator('[name="adult"]').check();
  await page.locator('#auth-submit').click();
  await page.locator('#shell').waitFor({state: 'visible'});
}
async function userLink(page, path) {
  await page.locator('#user-menu-toggle').click();
  await page.locator(`#user-menu a[href="#/${path}"]`).click();
  await page.waitForURL(`**/#/${path}`);
  await page.locator(`#user-menu a[href="#/${path}"][aria-current="page"]`).waitFor({state: 'attached'});
}
async function logout(page) {
  await page.locator('#user-menu-toggle').click();
  await page.locator('#logout').click();
  await page.locator('#cover').waitFor({state: 'visible'});
}

test('submenu abre abaixo do nome e fecha por Escape, clique fora e navegação por teclado', async t => {
  const page = await openPage(t);
  await guest(page);
  const toggle = page.locator('#user-menu-toggle');
  const menu = page.locator('#user-menu');
  assert.equal(await page.locator('#user-name').textContent(), 'Visitante');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(await menu.isVisible());
  assert.ok((await menu.boundingBox()).y >= (await toggle.boundingBox()).y + (await toggle.boundingBox()).height);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '#/favoritos');
  await page.keyboard.press('Escape');
  assert.ok(await menu.isHidden());
  assert.equal(await page.evaluate(() => document.activeElement.id), 'user-menu-toggle');
  await toggle.click();
  await page.locator('#view h1').click();
  assert.ok(await menu.isHidden());
  await toggle.click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'logout');
  await page.keyboard.press('Tab');
  assert.ok(await menu.isHidden());
});

test('favoritos e feitos persistem, atualizam contadores e ficam separados por conta', async t => {
  const page = await openPage(t);
  await register(page, 'Ana Brito', 'ana@example.test');
  assert.equal(await page.locator('#user-name').textContent(), 'Ana');
  await page.goto(`${origin}/#/drink/negroni`);
  await page.locator('#act-fav').click();
  for (const step of await page.locator('.tut-step').all()) await step.click();
  assert.equal(await page.locator('#act-done').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-user-count="fav"]').textContent(), '1');
  assert.equal(await page.locator('[data-user-count="done"]').textContent(), '1');
  await userLink(page, 'favoritos');
  await page.locator('#view .card[href="#/drink/negroni"]').waitFor();
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.locator('#view .card[href="#/drink/negroni"]').click();
  await page.locator('#act-fav').click();
  await page.locator('.back').click();
  await page.locator('.collection-empty').waitFor();
  assert.equal(await page.locator('[data-user-count="fav"]').textContent(), '0');
  await userLink(page, 'feitos');
  await page.locator('#view .card[href="#/drink/negroni"]').waitFor();
  await logout(page);
  await register(page, 'Bia Silva', 'bia@example.test');
  assert.equal(await page.locator('[data-user-count="fav"]').textContent(), '0');
  assert.equal(await page.locator('[data-user-count="done"]').textContent(), '0');
  await userLink(page, 'feitos');
  await page.locator('.collection-empty').waitFor();
  await logout(page);
  await page.locator('[data-mode="login"]').click();
  await page.locator('[name="email"]').fill('ana@example.test');
  await page.locator('[name="password"]').fill('senha-de-teste');
  await page.locator('#auth-submit').click();
  await page.locator('#shell').waitFor({state: 'visible'});
  assert.equal(await page.locator('[data-user-count="done"]').textContent(), '1');
  await userLink(page, 'feitos');
  await page.locator('#view .card[href="#/drink/negroni"]').waitFor();
});

test('carrinho vazio e seus textos são traduzidos nos três idiomas', async t => {
  const page = await openPage(t);
  await guest(page);
  await userLink(page, 'carrinho');
  for (const [lang, title, empty] of [['pt', 'Carrinho de compras', 'Seu carrinho está vazio'], ['en', 'Shopping cart', 'Your cart is empty'], ['es', 'Carrito de compras', 'Tu carrito está vacío']]) {
    await page.locator(`#shell [data-lang="${lang}"]`).click();
    assert.equal(await page.locator('#view h1').textContent(), title);
    assert.equal(await page.locator('.cart-empty h2').textContent(), empty);
    assert.equal(await page.locator('#user-menu a[href="#/carrinho"] [data-i18n="cart"]').textContent(), title);
  }
  assert.equal(await page.locator('.cart-empty input, .cart-empty form').count(), 0);
  assert.equal(await page.locator('[data-user-count="cart"]').textContent(), '0');
});

async function ingredient(page, id) {
  const button = page.locator(`[data-ing="${id}"]`);
  const group = page.locator('.ing-group').filter({has: button});
  if (!await group.evaluate(el => el.open)) await group.locator('summary').click();
  await button.click();
}
async function barName(page, action, name) {
  await page.locator(`#bar-${action}`).click();
  await page.locator('dialog input[name="barName"]').fill(name);
  await page.locator('dialog button[type="submit"]').click();
  await page.locator('dialog').waitFor({state: 'hidden'});
}
async function openBar(page) {
  await page.locator('[data-tab="bar"]').click();
  await page.locator('#bar-select').waitFor();
}

test('migra o bar antigo, separa os ingredientes por espaço e permite renomear e excluir com confirmação', async t => {
  const page = await openPage(t);
  await page.evaluate(() => localStorage.setItem('hometender.bar.visitante', JSON.stringify(['gin', 'vermute_tinto'])));
  await guest(page);
  await openBar(page);
  assert.equal(await page.locator('#bar-select option').count(), 1);
  assert.equal(await page.locator('[data-ing="gin"]').getAttribute('aria-pressed'), 'true');
  await barName(page, 'rename', 'Apartamento');
  const apartment = await page.locator('#bar-select').inputValue();
  await barName(page, 'create', 'Casa de campo');
  const country = await page.locator('#bar-select').inputValue();
  assert.notEqual(country, apartment);
  assert.equal(await page.locator('[data-ing="gin"]').getAttribute('aria-pressed'), 'false');
  for (const id of ['cachaca', 'limao', 'acucar']) await ingredient(page, id);
  await page.locator('#results a.result[href="#/drink/caipirinha"]').waitFor();
  assert.equal(await page.locator('#results a.result[href="#/drink/negroni"]').count(), 0);
  await page.reload({waitUntil: 'domcontentloaded'});
  assert.equal(await page.locator('#bar-select').inputValue(), country);
  assert.equal(await page.locator('[data-ing="cachaca"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#bar-select').selectOption(apartment);
  assert.equal(await page.locator('[data-ing="gin"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-ing="cachaca"]').getAttribute('aria-pressed'), 'false');
  await page.locator('#bar-create').click();
  await page.locator('dialog input').fill('apartamento');
  await page.locator('dialog button[type="submit"]').click();
  await page.locator('#bar-dialog-error').waitFor({state: 'visible'});
  assert.match(await page.locator('#bar-dialog-error').textContent(), /já tem/);
  await page.keyboard.press('Escape');
  await page.locator('dialog').waitFor({state: 'hidden'});
  assert.equal(await page.locator('#bar-select option').count(), 2);
  await page.locator('#bar-select').selectOption(country);
  await page.locator('#bar-delete').click();
  await page.locator('[data-dialog-cancel]').click();
  assert.equal(await page.locator('#bar-select option').count(), 2);
  await page.locator('#bar-delete').click();
  await page.locator('dialog button[type="submit"]').click();
  await page.locator('dialog').waitFor({state: 'hidden'});
  assert.equal(await page.locator('#bar-select').inputValue(), apartment);
  assert.equal(await page.locator('#bar-select option').count(), 1);
  assert.ok(await page.locator('#bar-delete').isDisabled());
  assert.equal(await page.locator('[data-ing="gin"]').getAttribute('aria-pressed'), 'true');
});

test('Quase lá adiciona cada item ao carrinho sem duplicar, sem alterar a prateleira e sem abrir a receita', async t => {
  const page = await openPage(t);
  await guest(page);
  await openBar(page);
  for (const id of ['gin', 'vermute_tinto']) await ingredient(page, id);
  assert.equal(await page.locator('.next-buy').count(), 0);
  const missing = page.locator('[data-near-drink="negroni"] [data-add-cart="campari"]');
  await missing.click();
  assert.ok(page.url().endsWith('#/bar'));
  assert.ok(await missing.isDisabled());
  assert.equal(await page.locator('[data-user-count="cart"]').textContent(), '1');
  assert.equal(await page.locator('[data-ing="campari"]').getAttribute('aria-pressed'), 'false');
  assert.ok(await page.locator('[data-add-cart="campari"]').evaluateAll(buttons => buttons.every(button => button.disabled)));
  await barName(page, 'create', 'Outro endereço');
  assert.equal(await page.locator('[data-user-count="cart"]').textContent(), '1');
  await userLink(page, 'carrinho');
  assert.equal(await page.locator('[data-cart-product]').count(), 1);
  assert.match(await page.locator('[data-cart-product="campari"]').textContent(), /Campari/);
  assert.equal(await page.locator('a.amazon-link').count(), 0);
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.locator('[data-cart-product="campari"]').waitFor();
  await page.locator('[data-remove-cart="campari"]').click();
  await page.locator('.cart-empty').waitFor();
  assert.equal(await page.locator('[data-user-count="cart"]').textContent(), '0');
});

test('bares e carrinho reaparecem ao entrar na conta e não vazam para outra pessoa', async t => {
  const page = await openPage(t);
  await register(page, 'Ana Brito', 'ana@example.test');
  await openBar(page);
  for (const id of ['gin', 'vermute_tinto']) await ingredient(page, id);
  await page.locator('[data-near-drink="negroni"] [data-add-cart="campari"]').click();
  await barName(page, 'create', 'Casa de campo');
  await ingredient(page, 'cachaca');
  await logout(page);
  await register(page, 'Bia Silva', 'bia@example.test');
  await openBar(page);
  assert.equal(await page.locator('#bar-select option').count(), 1);
  assert.equal(await page.locator('[data-ing="gin"]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('[data-user-count="cart"]').textContent(), '0');
  await logout(page);
  await page.locator('[data-mode="login"]').click();
  await page.locator('[name="email"]').fill('ana@example.test');
  await page.locator('[name="password"]').fill('senha-de-teste');
  await page.locator('#auth-submit').click();
  await page.locator('#shell').waitFor({state: 'visible'});
  await openBar(page);
  assert.equal(await page.locator('#bar-select option').count(), 2);
  assert.equal(await page.locator('#bar-select option:checked').textContent(), 'Casa de campo');
  assert.equal(await page.locator('[data-ing="cachaca"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-user-count="cart"]').textContent(), '1');
});

test('links de associado aparecem somente quando configurados e preservam a tag da Amazon', async t => {
  const page = await openPage(t);
  const url = 'https://www.amazon.com.br/dp/TEST123?tag=teste-20&linkCode=ll1';
  await page.route('**/affiliate-links.js*', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('export const AMAZON_AFFILIATE_LINKS = {};', `export const AMAZON_AFFILIATE_LINKS = ${JSON.stringify({gin: url})};`);
    await route.fulfill({response, body});
  });
  await page.evaluate(() => localStorage.setItem('hometender.profile.visitante', JSON.stringify({version: 1, activeBarId: 'bar-default', bars: [{id: 'bar-default', name: 'Apartamento', ingredients: []}], cart: ['gin', 'campari']})));
  await page.reload({waitUntil: 'domcontentloaded'});
  await guest(page);
  await userLink(page, 'carrinho');
  const link = page.locator('[data-cart-product="gin"] .amazon-link');
  assert.equal(await link.getAttribute('href'), url);
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.match(await link.getAttribute('rel'), /sponsored/);
  assert.equal(await page.locator('[data-cart-product="campari"] .amazon-link').count(), 0);
  await page.locator('.cart-disclosure').waitFor();
  await page.locator('#cart-clear').click();
  await page.locator('.cart-empty').waitFor();
  assert.equal(await page.locator('[data-user-count="cart"]').textContent(), '0');
});

test('Quase lá, criação de bares e carrinho cabem no celular', async t => {
  for (const width of [320, 390]) await t.test(`${width}px`, async t => {
    const page = await openPage(t, {width, height: 844});
    await guest(page);
    await openBar(page);
    for (const id of ['gin', 'vermute_tinto']) await ingredient(page, id);
    const button = page.locator('[data-near-drink="negroni"] [data-add-cart="campari"]');
    await button.click();
    const box = await button.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await barName(page, 'create', 'Casa de campo');
    assert.equal(await page.locator('#bar-select option:checked').textContent(), 'Casa de campo');
    await userLink(page, 'carrinho');
    await page.locator('[data-cart-product="campari"]').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
});

test('nome e submenu continuam acessíveis em telas pequenas e intermediárias', async t => {
  for (const width of [320, 390, 768, 1024]) {
    await t.test(`${width}px`, async t => {
      const page = await openPage(t, {width, height: 844});
      await guest(page);
      await page.evaluate(() => localStorage.setItem('hometender.devguest', JSON.stringify({name: 'Alexandramuitolonga da Silva'})));
      await page.reload({waitUntil: 'domcontentloaded'});
      await page.locator('#user-menu-toggle').click();
      for (const selector of ['#user-menu-toggle', '#user-name', '#user-menu']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box && box.width > 0 && box.x >= 0 && box.x + box.width <= width, `${selector} cabe na tela`);
      }
      await page.locator('#user-menu a[href="#/favoritos"]').click();
      await page.locator('.collection-empty').waitFor();
      assert.ok(await page.locator('#user-menu').isHidden());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    });
  }
});
