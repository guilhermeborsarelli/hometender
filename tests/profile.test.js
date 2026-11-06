import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfileStore, ProfileError} from '../app/profile.js';
import {amazonLinkFor} from '../app/affiliate-links.js';
import {analyzeBar} from '../app/engine.js';

const memoryStorage = () => {
  const values = new Map();
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
};
const active = profile => profile.bars.find(bar => bar.id === profile.activeBarId);
const code = expected => error => error instanceof ProfileError && error.code === expected;

test('migra o bar antigo sem apagar a lista original e preserva os dois espaços após recarregar', () => {
  const storage = memoryStorage();
  const original = JSON.stringify(['gin', 'campari', 'gin', 'nao-existe']);
  storage.setItem('hometender.bar.ana@example.test', original);
  const profile = createProfileStore(storage, 'ana@example.test');
  assert.deepEqual(active(profile.read()).ingredients, ['gin', 'campari']);
  profile.renameBar('bar-default', 'Apartamento');
  profile.createBar('Casa de campo');
  profile.setIngredients(['cachaca', 'limao']);
  const restored = createProfileStore(storage, 'ana@example.test').read();
  assert.equal(restored.bars.length, 2);
  assert.equal(active(restored).name, 'Casa de campo');
  assert.deepEqual(active(restored).ingredients, ['cachaca', 'limao']);
  assert.deepEqual(restored.bars.find(bar => bar.name === 'Apartamento').ingredients, ['gin', 'campari']);
  assert.equal(storage.getItem('hometender.bar.ana@example.test'), original);
});

test('as sugestões usam somente os ingredientes do bar selecionado', () => {
  const profile = createProfileStore(memoryStorage(), 'ana@example.test');
  profile.setIngredients(['gin', 'campari', 'vermute_tinto']);
  const apartment = profile.read().activeBarId;
  profile.createBar('Casa de campo');
  profile.setIngredients(['cachaca', 'limao', 'acucar']);
  const country = profile.read().activeBarId;
  const suggestions = () => analyzeBar(active(profile.read()).ingredients).classics.map(row => row.drink.id);
  assert.ok(suggestions().includes('caipirinha'));
  assert.ok(!suggestions().includes('negroni'));
  profile.selectBar(apartment);
  assert.ok(suggestions().includes('negroni'));
  assert.ok(!suggestions().includes('caipirinha'));
  profile.selectBar(country);
  assert.deepEqual(active(profile.read()).ingredients, ['cachaca', 'limao', 'acucar']);
});

test('valida nomes, evita bares duplicados e protege os dados contra alteração por referência', () => {
  const profile = createProfileStore(memoryStorage(), 'ana@example.test');
  profile.renameBar('bar-default', '  Apartamento   principal  ');
  assert.equal(active(profile.read()).name, 'Apartamento principal');
  assert.throws(() => profile.createBar('apartamento PRINCIPAL'), code('barNameExists'));
  assert.throws(() => profile.createBar('  '), code('barNameRequired'));
  assert.throws(() => profile.createBar('a'.repeat(61)), code('barNameTooLong'));
  profile.createBar('Casa de campo');
  assert.throws(() => profile.renameBar(profile.read().activeBarId, 'Apartamento principal'), code('barNameExists'));
  assert.throws(() => profile.selectBar('ausente'), code('barNotFound'));
  const snapshot = profile.read(); snapshot.bars[0].ingredients.push('gin'); snapshot.cart.push('campari');
  assert.deepEqual(profile.read().bars[0].ingredients, []);
  assert.deepEqual(profile.read().cart, []);
});

test('excluir um bar mantém os outros e o carrinho e impede excluir o último', () => {
  const profile = createProfileStore(memoryStorage(), 'ana@example.test');
  profile.setIngredients(['gin']);
  profile.addToCart('campari');
  profile.createBar('Casa de campo');
  const country = profile.read().activeBarId;
  profile.deleteBar(country);
  assert.equal(profile.read().activeBarId, 'bar-default');
  assert.deepEqual(active(profile.read()).ingredients, ['gin']);
  assert.deepEqual(profile.read().cart, ['campari']);
  assert.throws(() => profile.deleteBar('bar-default'), code('barKeepOne'));
});

test('carrinho deduplica ingredientes entre bares sem marcar produtos como comprados', () => {
  const storage = memoryStorage();
  const profile = createProfileStore(storage, 'ana@example.test');
  profile.setIngredients(['gin']);
  profile.addToCart('campari'); profile.addToCart('campari');
  profile.createBar('Casa de campo'); profile.addToCart('campari'); profile.addToCart('vermute_tinto');
  assert.deepEqual(profile.read().cart, ['campari', 'vermute_tinto']);
  assert.deepEqual(active(profile.read()).ingredients, []);
  const restored = createProfileStore(storage, 'ana@example.test');
  assert.deepEqual(restored.read().cart, ['campari', 'vermute_tinto']);
  restored.removeFromCart('campari');
  assert.deepEqual(restored.read().cart, ['vermute_tinto']);
  restored.clearCart(); assert.deepEqual(restored.read().cart, []);
  assert.throws(() => restored.addToCart('ausente'), code('ingredientNotFound'));
});

test('bares e carrinho ficam isolados por conta; legado sem dono pertence apenas ao visitante', () => {
  const storage = memoryStorage();
  storage.setItem('barnoir.bar', JSON.stringify(['vodka']));
  const ana = createProfileStore(storage, 'ana@example.test');
  assert.deepEqual(active(ana.read()).ingredients, []);
  ana.setIngredients(['gin']); ana.addToCart('campari'); ana.createBar('Casa de campo');
  const bia = createProfileStore(storage, 'bia@example.test');
  assert.equal(bia.read().bars.length, 1);
  assert.deepEqual(active(bia.read()).ingredients, []);
  assert.deepEqual(bia.read().cart, []);
  assert.deepEqual(active(createProfileStore(storage, 'visitante').read()).ingredients, ['vodka']);
});

test('dados antigos incompletos ou inválidos não impedem abrir o perfil', () => {
  const storage = memoryStorage();
  storage.setItem('hometender.profile.ana', JSON.stringify({bars: [null, {id: 'bar-a', name: 'Apartamento', ingredients: ['gin', 'gin', 'x']}, {id: 'bar-a'}], activeBarId: 'ausente', cart: ['campari', 'x', 'campari']}));
  const profile = createProfileStore(storage, 'ana').read();
  assert.equal(profile.bars.length, 1);
  assert.equal(profile.activeBarId, 'bar-a');
  assert.deepEqual(active(profile).ingredients, ['gin']);
  assert.deepEqual(profile.cart, ['campari']);
  storage.setItem('hometender.profile.bia', 'JSON inválido');
  assert.equal(createProfileStore(storage, 'bia').read().bars.length, 1);
});

test('uma falha de armazenamento não muda o perfil em memória nem perde a lista antiga', () => {
  const storage = memoryStorage();
  const profile = createProfileStore(storage, 'ana');
  profile.setIngredients(['gin']);
  const before = profile.read();
  storage.setItem = () => { throw new Error('quota excedida'); };
  assert.throws(() => profile.createBar('Casa de campo'), /quota/);
  assert.throws(() => profile.setIngredients(['cachaca']), /quota/);
  assert.throws(() => profile.addToCart('campari'), /quota/);
  assert.deepEqual(profile.read(), before);
});

test('links Amazon preservam a afiliação e recusam endereços inseguros ou inválidos', () => {
  const url = 'https://www.amazon.com.br/dp/TEST123?tag=teste-20&linkCode=ll1';
  assert.equal(amazonLinkFor('gin', {gin: url}), url);
  assert.equal(amazonLinkFor('gin', {gin: 'https://amzn.to/exemplo'}), 'https://amzn.to/exemplo');
  for (const bad of ['javascript:alert(1)', 'http://amazon.com.br/', 'https://amazon.com.br.evil.test/', 'https://usuario:senha@amazon.com.br/', 'não é link']) {
    assert.equal(amazonLinkFor('gin', {gin: bad}), null);
  }
  assert.equal(amazonLinkFor('gin'), null);
});
