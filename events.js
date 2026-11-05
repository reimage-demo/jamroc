const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const format = value => new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value + ':00Z'));
let latest = [];
let connected = false;
export function easternNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function groupEvents(events, now = easternNow()) {
  const upcoming = [], past = [];
  for (const event of events) (event.dateTbd || (event.endsAt || event.startsAt.slice(0, 10) + 'T23:59') >= now ? upcoming : past).push(event);
  upcoming.sort((a, b) => Number(Boolean(a.dateTbd)) - Number(Boolean(b.dateTbd)) || a.startsAt.localeCompare(b.startsAt));
  past.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, past };
}
function card(event) {
  const image = event.imageUrl && /^https:\/\//.test(event.imageUrl)
    ? `<a class="event-poster" href="${esc(event.imageUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View full photo for ${esc(event.title)}"><img src="${esc(event.imageUrl)}" alt="${esc(event.title)}" width="1200" height="900" loading="lazy" /></a>`
    : '<div class="event-no-photo" aria-hidden="true"><span>JAM ROC</span><small>RESTAURANT & LOUNGE</small></div>';
  return `<article class="event-card">${image}<div class="event-copy"><p class="eyebrow">${event.dateTbd ? 'Coming soon' : esc(event.startsAt.slice(0, 10))}</p><h3>${esc(event.title)}</h3><p class="event-time">${event.dateTbd ? 'Date to be announced' : `<time datetime="${esc(event.startsAt)}">${esc(format(event.startsAt))}</time>${event.endsAt ? `<br>Until <time datetime="${esc(event.endsAt)}">${esc(format(event.endsAt))}</time>` : ''}<br>Eastern time`}</p><p class="event-location">${esc(event.location)}</p><p class="event-description">${esc(event.description)}</p></div></article>`;
}
export function renderEvents(events) {
  const notice = document.querySelector('#events-notice');
  if (!notice) return;
  latest = events;
  connected = true;
  const { upcoming, past } = groupEvents(events);
  notice.textContent = upcoming.length ? '' : 'No upcoming events announced yet. Check back soon for our next night out.';
  document.querySelector('#upcoming-events').innerHTML = upcoming.map(card).join('');
  document.querySelector('#past-events').innerHTML = past.map(card).join('');
  document.querySelector('#past-events-section').hidden = !past.length;
}
export function eventsError() {
  connected = false;
  const notice = document.querySelector('#events-notice');
  if (notice) notice.textContent = 'Live events are unavailable right now. Please refresh to try again or call (860) 906-1812 for the latest details.';
}
if (typeof document !== 'undefined' && document.body.dataset.page === 'events') {
  // Reclassify events as time passes without requiring a database edit.
  setInterval(() => { if (connected && latest.length && navigator.onLine) renderEvents(latest); }, 60000);
}
