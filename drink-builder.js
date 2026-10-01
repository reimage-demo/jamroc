import { drinkDefaults } from './drink-config.js';
import { selectedDrink } from './drink-cart.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createDrinkBuilder({onSave}) {
  const dialog = document.querySelector('#drink-builder-dialog');
  if (!dialog) return {update() {}, renderEntry() {return '';}};
  let config = drinkDefaults;
  let error = '';
  let step = 0;
  let spiritGroup = '';
  let opener = null;
  const selection = {spirit:'', chaser:'', extra:''};
  const steps = ['Spirit','Chaser','Extras','Review'];
  const available = type => config?.[type]?.filter(o => o.available) || [];
  const canBuild = () => config?.enabled && available('spirits').length > 0 && available('chasers').length > 0;
  function choice(option, key) {
    const selected = selection[key] === option.id;
    return `<label class="builder-choice"><input type="radio" name="builder-${key}" data-choice="${key}" value="${esc(option.id)}" ${selected ? 'checked' : ''}><span>${esc(option.name)}${key === 'extra' && option.portion ? `<small>${esc(option.portion)}${option.price !== undefined ? ' · +$' + (option.price/100).toFixed(2) : ''}</small>` : ''}</span></label>`;
  }
  function spiritChoices() {
    const spirits = available('spirits');
    const groups = [...new Set(spirits.map(o => o.group))];
    if (!groups.includes(spiritGroup)) spiritGroup = groups[0] || '';
    return `<div class="spirit-groups" role="group" aria-label="Spirit type">${groups.map(group => `<button type="button" data-spirit-group="${esc(group)}" aria-pressed="${group === spiritGroup}">${esc(group)}</button>`).join('')}</div><fieldset class="builder-choices"><legend>${esc(spiritGroup)}</legend>${spirits.filter(o => o.group === spiritGroup).map(o => choice(o,'spirit')).join('')}</fieldset>`;
  }
  function render(focus = true) {
    let body = '';
    const drink = selectedDrink(config, selection);
    if (!canBuild()) body = '<h3 id="builder-step" tabindex="-1">Currently unavailable</h3><p>Please check back for available drink options.</p>';
    else if (step === 0) body = `<h3 id="builder-step" tabindex="-1">Choose your spirit</h3>${spiritChoices()}`;
    else if (step === 1) body = `<h3 id="builder-step" tabindex="-1">Choose your chaser</h3><fieldset class="builder-choices"><legend>Chaser</legend>${available('chasers').map(o => choice(o,'chaser')).join('')}</fieldset>`;
    else if (step === 2) body = `<h3 id="builder-step" tabindex="-1">Extras</h3>${available('extras').length ? `<fieldset class="builder-choices"><legend>Choose up to one extra</legend>${choice({id:'',name:'No extra'},'extra')}${available('extras').map(o => choice(o,'extra')).join('')}</fieldset>` : '<p>Standard drink. No extras available.</p>'}`;
    else body = `<h3 id="builder-step" tabindex="-1">Your drink</h3>${drink ? `<dl class="drink-summary"><div><dt>Spirit</dt><dd>${esc(drink.spirit.name)}</dd></div><div><dt>Chaser</dt><dd>${esc(drink.chaser.name)}</dd></div><div><dt>Extra</dt><dd>${drink.extra ? esc(drink.extra.name) + ' · ' + esc(drink.extra.portion) : 'None'}</dd></div></dl><strong>Price coming soon</strong>` : '<p>Go back and choose an available spirit and chaser.</p>'}<p class="muted">Saving to your cart does not place an order.</p>`;
    dialog.innerHTML = `<button type="button" class="dialog-close" aria-label="Close drink builder">×</button><header class="builder-header"><h2 id="builder-title">Build Your Own Drink</h2><p>Step ${step+1} of 4</p></header><ol class="builder-progress" aria-label="Drink builder steps">${steps.map((s,i)=>`<li ${i===step?'aria-current="step"':''}>${s}</li>`).join('')}</ol><div class="builder-content">${body}</div><p id="builder-error" class="builder-error" role="alert">${esc(error)}</p><div class="builder-actions">${step>0?'<button type="button" class="builder-back" data-builder-back>Back</button>':'<span></span>'}${canBuild()?`<button type="button" class="item-link" data-builder-next ${step===3&&!drink?'disabled':''}>${step===3?'Save to cart':'Next'}</button>`:''}</div>`;
    if (focus && dialog.open) dialog.querySelector('#builder-step')?.focus();
  }
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-build-drink]');
    if (!button) return;
    opener = button;
    spiritGroup = available('spirits').find(o => o.id === selection.spirit)?.group || spiritGroup;
    error = ''; step = 0; render(false); dialog.showModal();
    dialog.querySelector('#builder-step')?.focus();
  });
  dialog.addEventListener('close', () => {
    if (opener?.isConnected) opener.focus();
    else document.querySelector('[data-build-drink]')?.focus();
  });
  dialog.addEventListener('change', e => {
    if (!e.target.dataset.choice || !e.target.checked) return;
    selection[e.target.dataset.choice] = e.target.value;
    error = ''; dialog.querySelector('#builder-error').textContent = '';
  });
  dialog.addEventListener('click', e => {
    const groupButton = e.target.closest('[data-spirit-group]');
    if (groupButton) {
      spiritGroup = groupButton.dataset.spiritGroup;
      if (!available('spirits').some(o => o.id === selection.spirit && o.group === spiritGroup)) selection.spirit = '';
      error = ''; render(false);
      [...dialog.querySelectorAll('[data-spirit-group]')].find(b => b.dataset.spiritGroup === spiritGroup)?.focus();
      return;
    }
    if (e.target.closest('[data-builder-back]')) {step--;error='';render();return;}
    if (!e.target.closest('[data-builder-next]')) return;
    if (!canBuild()) {error='Drink options are unavailable. Please try again.';render();return;}
    if (step===0 && !available('spirits').some(o => o.id === selection.spirit)) error='Choose a spirit to continue.';
    else if (step===1 && !available('chasers').some(o => o.id === selection.chaser)) error='Choose a chaser to continue.';
    else if (step===3) {
      const drink = selectedDrink(config,selection);
      if (!drink) error='Your choices have changed. Review the available options.';
      else {
        error=onSave(drink);
        if (!error) {
          dialog.close();
          const feedback = document.querySelector('#builder-feedback');
          if (feedback) feedback.textContent='Saved to cart.';
          return;
        }
      }
    } else {step++;error='';}
    if (error) {
      dialog.querySelector('#builder-error').textContent=error;
      dialog.querySelector('[data-choice]')?.focus();
    } else render();
  });
  return {
    renderEntry(search = '') {
      if (!config?.enabled || (search && !'build your own drink custom spirit chaser'.includes(search))) return '';
      return `<article class="food-card drink-card" data-reveal-key="build-your-own-drink"><div class="food-photo"><button type="button" class="builder-photo" data-build-drink aria-label="Customize your drink" ${!canBuild()?'disabled':''}><img src="assets/images/menu/build-your-own-drink.webp?v=20261001-new-drink-photos" width="600" height="800" alt="Plain empty drinking glass" loading="lazy" decoding="async"></button></div><div class="food-info"><h3><button type="button" class="item-name" data-build-drink ${!canBuild()?'disabled':''}>Build Your Own Drink</button></h3><p>Choose a spirit and a chaser.</p><div class="price"><span>${canBuild()?'Price coming soon':'Currently unavailable'}</span><button type="button" class="item-link" data-build-drink ${!canBuild()?'disabled':''}>Customize</button></div><span id="builder-feedback" class="cart-feedback" role="status"></span></div></article>`;
    },
    update(next) {
      config = next;
      const changed = [];
      for (const [key,type] of [['spirit','spirits'],['chaser','chasers'],['extra','extras']]) {
        if (selection[key] && !available(type).some(o => o.id===selection[key])) {selection[key]='';changed.push(key);}
      }
      if (changed.length) {step=0;error='Availability changed. Review your choices.';}
      if (dialog.open) render();
    },
    connectionError() {
      config = null;
      error='Drink options are unavailable. Please try again shortly.';
      if (dialog.open) render();
    },
  };
}
