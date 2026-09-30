// Pure helpers shared by the builder and its behavioral tests.
export function selectedDrink(config, selection) {
  if (!config?.enabled) return null;
  const find = (type, id) => config[type].find(o => o.id === id && o.available);
  const spirit = find('spirits', selection.spirit);
  const chaser = find('chasers', selection.chaser);
  const extra = selection.extra ? find('extras', selection.extra) : null;
  if (!spirit || !chaser || (selection.extra && !extra)) return null;
  return {spirit: {id:spirit.id,name:spirit.name}, chaser: {id:chaser.id,name:chaser.name}, extra: extra ? {id:extra.id,name:extra.name,portion:extra.portion || ''} : null};
}
export function drinkKey(drink) {
  return JSON.stringify([drink.spirit.id, drink.chaser.id, drink.extra?.id || '']);
}
export function addDrink(picks, drink) {
  const key = drinkKey(drink);
  const existing = picks.find(p => p.slug === 'build-your-own-drink' && p.drink && drinkKey(p.drink) === key);
  if (existing?.quantity >= 20) return 'Maximum 20 of this drink per cart.';
  if (!existing && picks.length >= 40) return 'Your cart is full. Remove an item to add another.';
  if (existing) { existing.quantity++; existing.drink = drink; }
  else picks.push({slug:'build-your-own-drink',name:'Your Jam-Roc Mix',quantity:1,drink});
  return '';
}
export function validPick(p) {
  if (!p || typeof p.slug !== 'string' || typeof p.name !== 'string' || !Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 20) return false;
  if (p.slug !== 'build-your-own-drink') return !p.drink && (p.option === undefined || typeof p.option === 'string');
  const valid = o => !!o && typeof o.id === 'string' && o.id.length <= 100 && typeof o.name === 'string' && o.name.length <= 100;
  return valid(p.drink?.spirit) && valid(p.drink?.chaser) && (p.drink.extra === null || (valid(p.drink.extra) && typeof p.drink.extra.portion === 'string'));
}
export function drinkSummary(drink) {
  return `Spirit: ${drink.spirit.name}\nChaser: ${drink.chaser.name}\nExtra: ${drink.extra ? drink.extra.name + (drink.extra.portion ? ' · ' + drink.extra.portion : '') : 'None'}`;
}
