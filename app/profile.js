// Bares e lista de compras por conta, no armazenamento local do aparelho.
import {INGREDIENTS} from './data.js';

export class ProfileError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const ingredientIds = value => [...new Set((Array.isArray(value) ? value : []).filter(id => typeof id === 'string' && Object.hasOwn(INGREDIENTS, id)))];
const cleanName = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const nameKey = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const readJSON = (storage, key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };

export function createProfileStore(storage, userId, defaultBarName = 'Meu primeiro bar') {
  const key = `hometender.profile.${userId}`;
  const saved = readJSON(storage, key);
  const seen = new Set();
  const bars = (Array.isArray(saved?.bars) ? saved.bars : []).flatMap(bar => {
    if (!bar || typeof bar.id !== 'string' || !bar.id || seen.has(bar.id)) return [];
    seen.add(bar.id);
    return [{id: bar.id, name: cleanName(bar.name).slice(0, 60) || defaultBarName, ingredients: ingredientIds(bar.ingredients)}];
  });
  if (!bars.length) {
    const legacy = readJSON(storage, `hometender.bar.${userId}`);
    // O legado sem dono só pode ser recuperado no perfil de visitante.
    const ingredients = legacy ?? (userId === 'visitante' ? readJSON(storage, 'barnoir.bar') : []);
    bars.push({id: 'bar-default', name: defaultBarName, ingredients: ingredientIds(ingredients)});
  }
  let profile = {version: 1, bars, activeBarId: bars.some(bar => bar.id === saved?.activeBarId) ? saved.activeBarId : bars[0].id, cart: ingredientIds(saved?.cart)};
  const snapshot = () => ({...profile, bars: profile.bars.map(bar => ({...bar, ingredients: [...bar.ingredients]})), cart: [...profile.cart]});
  const commit = next => {
    // Só atualiza o estado em memória depois de salvar com sucesso.
    storage.setItem(key, JSON.stringify(next));
    profile = next;
    return snapshot();
  };
  const requireBar = (next, id) => {
    const bar = next.bars.find(bar => bar.id === id);
    if (!bar) throw new ProfileError('barNotFound');
    return bar;
  };
  const validName = (value, exceptId) => {
    const name = cleanName(value);
    if (!name) throw new ProfileError('barNameRequired');
    if (name.length > 60) throw new ProfileError('barNameTooLong');
    if (profile.bars.some(bar => bar.id !== exceptId && nameKey(bar.name) === nameKey(name))) throw new ProfileError('barNameExists');
    return name;
  };

  return {
    read: snapshot,
    setIngredients(ids) {
      const next = snapshot();
      requireBar(next, next.activeBarId).ingredients = ingredientIds(ids);
      return commit(next);
    },
    selectBar(id) {
      const next = snapshot(); requireBar(next, id); next.activeBarId = id;
      return commit(next);
    },
    createBar(value) {
      const name = validName(value);
      const next = snapshot();
      const id = `bar-${globalThis.crypto.randomUUID()}`;
      next.bars.push({id, name, ingredients: []}); next.activeBarId = id;
      return commit(next);
    },
    renameBar(id, value) {
      const name = validName(value, id);
      const next = snapshot(); requireBar(next, id).name = name;
      return commit(next);
    },
    deleteBar(id) {
      const next = snapshot(); requireBar(next, id);
      if (next.bars.length === 1) throw new ProfileError('barKeepOne');
      next.bars = next.bars.filter(bar => bar.id !== id);
      if (next.activeBarId === id) next.activeBarId = next.bars[0].id;
      return commit(next);
    },
    addToCart(id) {
      if (!Object.hasOwn(INGREDIENTS, id)) throw new ProfileError('ingredientNotFound');
      if (profile.cart.includes(id)) return snapshot();
      const next = snapshot(); next.cart.push(id);
      return commit(next);
    },
    removeFromCart(id) {
      const next = snapshot(); next.cart = next.cart.filter(item => item !== id);
      return commit(next);
    },
    clearCart() { const next = snapshot(); next.cart = []; return commit(next); }
  };
}
