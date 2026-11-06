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

test('carrinho é uma página futura traduzida nos três idiomas', async t => {
  const page = await openPage(t);
  await guest(page);
  await userLink(page, 'carrinho');
  for (const [lang, title, soon] of [['pt', 'Carrinho de compras', 'Em breve'], ['en', 'Shopping cart', 'Coming soon'], ['es', 'Carrito de compras', 'Próximamente']]) {
    await page.locator(`#shell [data-lang="${lang}"]`).click();
    assert.equal(await page.locator('#view h1').textContent(), title);
    assert.equal(await page.locator('.cart-placeholder h2').textContent(), soon);
    assert.equal(await page.locator('#user-menu a[href="#/carrinho"] [data-i18n="cart"]').textContent(), title);
  }
  assert.equal(await page.locator('.cart-placeholder button, .cart-placeholder input, .cart-placeholder form').count(), 0);
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
