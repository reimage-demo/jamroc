import { drinkDefaults } from './drink-config.js';
import { selectedDrink } from './drink-cart.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createDrinkBuilder({onSave}) {
  const dialog = document.querySelector('#drink-builder-dialog');
  if (!dialog) return {update() {}, renderEntry() {return '';}};
  let config = drinkDefaults;
  let error = '';
  let step = 0;
  const selection = {spirit:'', chaser:'', extra:''};
  const steps = ['Spirit','Chaser','Extras','Review'];
  const available = type => config?.[type]?.filter(o => o.available) || [];
  const canBuild = () => config?.enabled && available('spirits').length > 0 && available('chasers').length > 0;
  function choices(type, selected) {
    const options = available(type);
    const groups = [...new Set(options.map(o => o.group))];
    return groups.map(group => `<optgroup label="${esc(group)}">${options.filter(o => o.group === group).map(o => `<option value="${esc(o.id)}" ${o.id === selected ? 'selected' : ''}>${esc(o.name)}${type === 'extras' && o.portion ? ' · '+esc(o.portion) : ''}${type === 'extras' && o.price !== undefined ? ' (+$'+(o.price/100).toFixed(2)+')' : ''}</option>`).join('')}</optgroup>`).join('');
  }
  function render(focus = true) {
    let body = '';
    const drink = selectedDrink(config, selection);
    if (!canBuild()) body = '<h3 id="builder-step" tabindex="-1">Builder unavailable</h3><p>Our bar is updating the drink options. Please try again shortly.</p>';
    else if (step === 0) body = `<h3 id="builder-step" tabindex="-1">Choose your spirit</h3><label for="builder-spirit">Your bottle</label><select id="builder-spirit" data-choice="spirit"><option value="">Choose a spirit</option>${choices('spirits',selection.spirit)}</select>`;
    else if (step === 1) body = `<h3 id="builder-step" tabindex="-1">Choose your chaser</h3><label for="builder-chaser">Your mixer</label><select id="builder-chaser" data-choice="chaser"><option value="">Choose a chaser</option>${choices('chasers',selection.chaser)}</select><p class="muted">Only currently available mixers are listed.</p>`;
    else if (step === 2) body = `<h3 id="builder-step" tabindex="-1">Make it yours</h3>${available('extras').length ? `<label for="builder-extra">One optional extra</label><select id="builder-extra" data-choice="extra"><option value="">Standard drink · No extra</option>${choices('extras',selection.extra)}</select><p class="muted">Choose up to one extra, with a portion set by our bar.</p>` : '<p>Standard drink · No extras currently available</p>'}`;
    else body = `<h3 id="builder-step" tabindex="-1">Your Jam-Roc Mix</h3>${drink ? `<dl class="drink-summary"><div><dt>Spirit</dt><dd>${esc(drink.spirit.name)}</dd></div><div><dt>Chaser</dt><dd>${esc(drink.chaser.name)}</dd></div><div><dt>Extra</dt><dd>${drink.extra ? esc(drink.extra.name) + ' · ' + esc(drink.extra.portion) : 'None'}</dd></div></dl><strong>Price coming soon</strong>` : '<p>Please go back and choose an available spirit and chaser.</p>'}<p class="muted">Save your mix while you browse. This does not place an order.</p>`;
    dialog.innerHTML = `<button type="button" class="dialog-close" aria-label="Close drink builder">×</button><img class="builder-logo" src="assets/brand/logo.webp" width="96" height="80" alt="Jam Roc Restaurant & Lounge"><h2 id="builder-title">Build Your Own Drink</h2><p>Your Drink. Your Way.</p><ol class="builder-progress" aria-label="Drink builder steps">${steps.map((s,i)=>`<li ${i===step?'aria-current="step"':''}><span>${i+1}</span>${s}</li>`).join('')}</ol><div class="builder-content">${body}</div><p id="builder-error" class="builder-error" role="alert">${esc(error)}</p><div class="builder-actions">${step>0?'<button type="button" class="text-link" data-builder-back>Back</button>':'<span></span>'}${canBuild()?`<button type="button" class="button" data-builder-next ${step===3&&!drink?'disabled':''}>${step===3?'Save to cart':step===2?'Continue':'Next'}</button>`:''}</div>`;
    if (focus && dialog.open) dialog.querySelector('#builder-step')?.focus();
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-build-drink]')) return;
    error = ''; step = 0; render(false); dialog.showModal();
    dialog.querySelector('#builder-step')?.focus();
  });
  dialog.addEventListener('change', e => {
    if (!e.target.dataset.choice) return;
    selection[e.target.dataset.choice] = e.target.value;
    error = ''; dialog.querySelector('#builder-error').textContent = '';
  });
  dialog.addEventListener('click', e => {
    if (e.target.closest('[data-builder-back]')) {step--;error='';render();}
    if (!e.target.closest('[data-builder-next]')) return;
    if (!canBuild()) {error='Drink options are unavailable. Please try again.';render();return;}
    if (step===0 && !available('spirits').some(o => o.id === selection.spirit)) error='Choose an available spirit to continue.';
    else if (step===1 && !available('chasers').some(o => o.id === selection.chaser)) error='Choose an available chaser to continue.';
    else if (step===3) {
      const drink = selectedDrink(config,selection);
      if (!drink) error='Your choices have changed. Please review the available options.';
      else {
        error=onSave(drink);
        if (!error) {dialog.close();document.querySelector('#builder-feedback').textContent='Your Jam-Roc Mix was saved to your cart.';return;}
      }
    } else {step++;error='';}
    if (error) {
      dialog.querySelector('#builder-error').textContent=error;
      dialog.querySelector('[data-choice]')?.focus();
    } else render();
  });
  return {
    renderEntry() {
      if (!config?.enabled) return '';
      return `<section class="builder-entry" aria-labelledby="builder-entry-title"><div><p class="eyebrow">Your Drink. Your Way.</p><h2 id="builder-entry-title">Build Your Own Drink</h2><p>Pick your spirit, choose a chaser, and make it yours.</p><p class="muted">Spirit → Chaser → Extras → Review</p></div><button type="button" class="button" data-build-drink ${!canBuild()?'disabled':''}>Build my drink <span aria-hidden="true">↗</span></button><p id="builder-feedback" role="status"></p></section>`;
    },
    update(next) {
      config = next;
      const changed = [];
      for (const [key,type] of [['spirit','spirits'],['chaser','chasers'],['extra','extras']]) {
        if (selection[key] && !available(type).some(o => o.id===selection[key])) {selection[key]='';changed.push(key);}
      }
      if (changed.length) {step=0;error='Availability changed. Please review your drink choices.';}
      if (dialog.open) render();
    },
    connectionError() {
      // Never resurrect inventory from the fallback after a live connection fails.
      config = null;
      error='Live drink options are unavailable. Please try again shortly.';
      if (dialog.open) render();
    },
  };
}
