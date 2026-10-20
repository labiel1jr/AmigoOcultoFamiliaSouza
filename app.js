// Configure these two values in Supabase before publishing the site.
const SUPABASE_URL = 'https://rxqiyysaynrftyrkbpzy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VvWVCYpEw3vlXAgvfRacyA_op53s6vS';

const state = { token: localStorage.getItem('laços_access_token') || '', refreshToken: localStorage.getItem('laços_refresh_token') || '', user: null, products: [], signUp: true, waitingForCode: false, pendingPhone: '', search: '' };
const $ = (selector) => document.querySelector(selector);
const authDialog = $('#authDialog');
const profileDialog = $('#profileDialog');

function initHeroVideo() {
  const video = $('#heroVideo');
  if (!video) return;
  fetch('assets/gaze-frames.json').then(response => response.json()).then(gazeFrames => {
    const TAU = Math.PI * 2;
    const wrapAngle = angle => (angle % TAU + TAU) % TAU;
    const timeForAngle = angle => {
      const target = wrapAngle(angle);
      let nearestTime = gazeFrames[0][1];
      let nearestDistance = Infinity;
      for (const [sampleAngle, time] of gazeFrames) {
        const difference = Math.abs(target - sampleAngle);
        const distance = Math.min(difference, TAU - difference);
        if (distance < nearestDistance) { nearestDistance = distance; nearestTime = time; }
      }
      return nearestTime + 1 / 240;
    };
    let frame = 0;
    let desiredTime = 0;
    let pointer = null;
    let disposed = false;
    const mobile = window.matchMedia('(max-width: 700px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const seek = () => {
      frame = 0;
      if (disposed || mobile.matches || video.readyState < 2 || video.seeking) return;
      if (Math.abs(video.currentTime - desiredTime) > 1 / 48) video.currentTime = Math.min(desiredTime, video.duration - 1 / 24);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(seek); };
    const updateTarget = () => {
      if (mobile.matches || !pointer) return;
      const rect = video.getBoundingClientRect();
      const scale = Math.max(rect.width / 1920, rect.height / 1080);
      const eyeX = rect.left + rect.width / 2 + (948 - 960) * scale;
      const eyeY = rect.top + rect.height / 2 + (418 - 540) * scale;
      const dx = pointer.x - eyeX;
      const dy = pointer.y - eyeY;
      if (Math.hypot(dx, dy) > 8) { desiredTime = timeForAngle(Math.atan2(dy, dx)); schedule(); }
    };
    const move = event => { pointer = { x: event.clientX, y: event.clientY }; updateTarget(); };
    const ready = () => {
      video.loop = mobile.matches;
      if (mobile.matches && !reducedMotion.matches) void video.play().catch(() => {});
      else { video.pause(); if (!mobile.matches) { updateTarget(); schedule(); } }
    };
    video.addEventListener('seeked', schedule);
    video.addEventListener('loadeddata', ready);
    mobile.addEventListener('change', ready);
    reducedMotion.addEventListener('change', ready);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, { passive: true });
    if (video.readyState >= 2) ready();
    const cleanup = () => {
      disposed = true; cancelAnimationFrame(frame);
      video.removeEventListener('seeked', schedule); video.removeEventListener('loadeddata', ready);
      mobile.removeEventListener('change', ready); reducedMotion.removeEventListener('change', ready);
      window.removeEventListener('pointermove', move); window.removeEventListener('resize', updateTarget); window.removeEventListener('scroll', updateTarget);
    };
    window.addEventListener('pagehide', cleanup, { once: true });
  }).catch(() => {});
}

function configured() { return SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20; }
function setError(target, message = '') { $(target).textContent = message; }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200); }
function authHeaders(extra = {}) { return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${state.token || SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', ...extra }; }
async function api(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.error || data?.hint || 'Não foi possível concluir. Tente novamente.');
  return data;
}
function brazilianPhoneDigits(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  return digits;
}
function formatBrazilianPhone(value) {
  const digits = brazilianPhoneDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  const areaCode = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  const firstGroupLength = digits.length === 11 ? 5 : 4;
  if (subscriber.length <= firstGroupLength) return `${areaCode} ${subscriber}`;
  return `${areaCode} ${subscriber.slice(0, firstGroupLength)}-${subscriber.slice(firstGroupLength)}`;
}
function formatError(error) {
  const message = error.message || '';
  if (/invalid phone|phone.*invalid/i.test(message)) return 'Confira o telefone. Digite o DDD e o número, com 10 ou 11 dígitos (ex.: 31 99339-5418).';
  if (/rate limit|too many/i.test(message)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (/already registered|already exists/i.test(message)) return 'Este telefone já tem cadastro. Escolha “Já tenho uma conta” para entrar.';
  if (/not found|does not exist/i.test(message)) return 'Não encontramos esse cadastro. Crie sua lista primeiro.';
  if (/invalid.*token|otp.*expired|token.*expired/i.test(message)) return 'Código inválido ou expirado. Peça um novo código e tente novamente.';
  if (/Failed to fetch/i.test(message)) return 'Não foi possível conectar ao serviço. Confira a conexão e a configuração Supabase.';
  return message;
}

async function loadPeople() {
  const grid = $('#peopleGrid');
  if (!configured()) { grid.innerHTML = '<div class="empty-state">Configure o Supabase seguindo o README para publicar as listas online.</div>'; return; }
  try {
    const rows = await api('/rest/v1/public_wishlists?select=full_name,products&order=full_name.asc', { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
    renderPeople(rows || []);
  } catch (error) { grid.innerHTML = `<div class="empty-state">Não foi possível carregar as listas. ${escapeHtml(formatError(error))}</div>`; }
}
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function safeUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function renderPeople(rows) {
  const grid = $('#peopleGrid');
  const filtered = rows.filter(row => String(row.full_name || '').toLocaleLowerCase('pt-BR').includes(state.search));
  if (!filtered.length) { grid.innerHTML = `<div class="empty-state">${rows.length ? 'Ninguém encontrado com esse nome.' : 'As listas da família vão aparecer aqui assim que alguém criar a sua.'}</div>`; return; }
  grid.innerHTML = filtered.map(row => {
    const name = escapeHtml(row.full_name || 'Pessoa da família');
    const products = Array.isArray(row.products) ? row.products : [];
    const initials = escapeHtml(name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase());
    return `<article class="person-card"><div class="person-top"><div class="avatar">${initials}</div><div><h3 class="person-name">${name}</h3><p class="person-label">Lista de presentes</p></div></div><div class="wishlist">${products.map(item => { const title = escapeHtml(item.name || 'Ideia de presente'); const link = safeUrl(item.url || ''); return `<a class="wishlist-item" ${link ? `href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer"` : 'href="#listas"'}><span>${title}</span><span aria-hidden="true">${link ? '↗' : '♡'}</span></a>`; }).join('')}</div></article>`;
  }).join('');
}
function openAuth(signUp = true) {
  if (!configured()) { toast('O site precisa ser conectado ao Supabase. Consulte o README.'); return; }
  state.signUp = signUp; state.waitingForCode = false; renderAuth(); authDialog.showModal();
}
function renderAuth() {
  $('#authTitle').textContent = state.waitingForCode ? 'Confira suas mensagens' : state.signUp ? 'Entre para a família' : 'Que bom ter você de volta';
  $('#authSubtitle').textContent = state.waitingForCode ? `Enviamos um código para ${state.pendingPhone}. Digite abaixo para continuar.` : state.signUp ? 'Vamos criar seu cantinho da lista. Você confirma o telefone com um código por SMS.' : 'Digite seu telefone e enviaremos um código de acesso por SMS.';
  $('#signupFields').classList.toggle('hidden', state.waitingForCode || !state.signUp);
  $('#phoneField').classList.toggle('hidden', state.waitingForCode);
  $('#codeField').classList.toggle('hidden', !state.waitingForCode);
  $('#authMode').classList.toggle('hidden', state.waitingForCode);
  $('#authMode').textContent = state.signUp ? 'Já tenho uma conta' : 'Quero criar minha lista';
  $('#authSubmit').innerHTML = state.waitingForCode ? 'Confirmar código <span>↗</span>' : 'Continuar <span>↗</span>';
  setError('#authError');
}
$('#authMode').addEventListener('click', () => { state.signUp = !state.signUp; renderAuth(); });
$('#phone').addEventListener('input', event => {
  const input = event.currentTarget;
  input.value = formatBrazilianPhone(input.value);
});
$('#authForm').addEventListener('submit', async event => {
  event.preventDefault(); setError('#authError');
  const button = $('#authSubmit'); button.disabled = true;
  try {
    if (!state.waitingForCode) {
      const phoneDigits = brazilianPhoneDigits($('#phone').value);
      if (!/^\d{10,11}$/.test(phoneDigits)) throw new Error('Informe um telefone brasileiro válido com DDD (10 ou 11 dígitos).');
      const phone = `+55${phoneDigits}`;
      const meta = {};
      if (state.signUp) {
        const fullName = $('#fullName').value.trim(); const age = Number($('#age').value);
        if (fullName.split(/\s+/).length < 2) throw new Error('Informe seu nome completo.');
        if (!Number.isInteger(age) || age < 1 || age > 120) throw new Error('Informe uma idade válida.');
        meta.full_name = fullName; meta.age = age;
      }
      await api('/auth/v1/otp', { method: 'POST', headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ phone, create_user: state.signUp, data: meta }) });
      state.pendingPhone = phone; state.waitingForCode = true; renderAuth(); $('#smsCode').focus();
    } else {
      const result = await api('/auth/v1/verify', { method: 'POST', headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ phone: state.pendingPhone, token: $('#smsCode').value.trim(), type: 'sms' }) });
      if (!result?.access_token) throw new Error('Não recebemos uma sessão válida. Solicite um novo código.');
      state.token = result.access_token; state.refreshToken = result.refresh_token || ''; localStorage.setItem('laços_access_token', state.token); localStorage.setItem('laços_refresh_token', state.refreshToken); state.user = result.user;
      authDialog.close(); await loadProfile(); await loadPeople(); toast('Você entrou! Sua lista já pode ser editada.');
    }
  } catch (error) { setError('#authError', formatError(error)); }
  finally { button.disabled = false; }
});

async function refreshSession() {
  if (!state.refreshToken) return false;
  try {
    const result = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ refresh_token: state.refreshToken }) });
    state.token = result.access_token; state.refreshToken = result.refresh_token; state.user = result.user;
    localStorage.setItem('laços_access_token', state.token); localStorage.setItem('laços_refresh_token', state.refreshToken); return true;
  } catch { clearSession(); return false; }
}
function clearSession() { state.token = ''; state.refreshToken = ''; state.user = null; localStorage.removeItem('laços_access_token'); localStorage.removeItem('laços_refresh_token'); updateAccountButton(); }
async function loadProfile() {
  if (!state.token) return;
  try {
    let rows = await api('/rest/v1/profiles?select=full_name,products&id=eq.' + encodeURIComponent(state.user.id));
    if (!rows?.length && await refreshSession()) rows = await api('/rest/v1/profiles?select=full_name,products&id=eq.' + encodeURIComponent(state.user.id));
    const profile = rows?.[0]; if (!profile) return;
    state.products = Array.isArray(profile.products) && profile.products.length ? profile.products : [{ name: '', url: '' }, { name: '', url: '' }];
    $('#profileTitle').textContent = `Oi, ${String(profile.full_name || '').split(' ')[0] || 'família'}!`;
    renderProductFields(); profileDialog.showModal();
  } catch (error) { clearSession(); toast(formatError(error)); }
}
function renderProductFields() {
  const wrap = $('#productFields');
  wrap.innerHTML = state.products.map((item, index) => `<div class="product-row"><label>Produto ${index + 1}<input data-name="${index}" value="${escapeHtml(item.name || '')}" maxlength="100" placeholder="Ex.: Livro de receitas"></label><label>Link (opcional)<input data-url="${index}" type="url" value="${escapeHtml(item.url || '')}" maxlength="500" placeholder="https://..."></label>${state.products.length > 2 ? `<button type="button" class="remove-product" data-remove="${index}" aria-label="Remover produto ${index + 1}">×</button>` : '<span></span>'}</div>`).join('') + (state.products.length < 3 ? '<button type="button" id="addProduct" class="add-product">＋ Adicionar mais uma ideia</button>' : '');
  wrap.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { readProductInputs(); state.products.splice(Number(button.dataset.remove), 1); renderProductFields(); }));
  $('#addProduct')?.addEventListener('click', () => { readProductInputs(); state.products.push({ name: '', url: '' }); renderProductFields(); });
}
function readProductInputs() { state.products = state.products.map((item, index) => ({ name: $(`[data-name="${index}"]`)?.value.trim() || '', url: $(`[data-url="${index}"]`)?.value.trim() || '' })); }
$('#productsForm').addEventListener('submit', async event => {
  event.preventDefault(); setError('#productsError'); readProductInputs();
  const selected = state.products.filter(item => item.name);
  if (selected.length < 2 || selected.length > 3) { setError('#productsError', 'Escolha de 2 a 3 produtos e dê um nome para cada um.'); return; }
  for (const item of selected) if (item.url && !safeUrl(item.url)) { setError('#productsError', `Confira o link de “${item.name}”. Use um endereço começando com https://`); return; }
  const button = $('#productsForm button[type="submit"]'); button.disabled = true;
  try {
    await api('/rest/v1/profiles?id=eq.' + encodeURIComponent(state.user.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ products: selected }) });
    state.products = selected; profileDialog.close(); await loadPeople(); updateAccountButton(); toast('Lista salva com sucesso!');
  } catch (error) { setError('#productsError', formatError(error)); }
  finally { button.disabled = false; }
});
$('#signOutButton').addEventListener('click', async () => {
  try { if (state.token) await api('/auth/v1/logout', { method: 'POST' }); } catch { /* Clear the local session even if network logout fails. */ }
  clearSession(); profileDialog.close(); toast('Você saiu da sua conta.');
});
function updateAccountButton() { $('#accountButton').textContent = state.token ? 'Minha lista' : 'Entrar'; }
$('#accountButton').addEventListener('click', () => { if (state.token) loadProfile(); else openAuth(false); });
$('#heroSignup').addEventListener('click', () => state.token ? loadProfile() : openAuth(true));
$('#searchInput').addEventListener('input', event => { state.search = event.target.value.trim().toLocaleLowerCase('pt-BR'); loadPeople(); });
async function init() {
  initHeroVideo();
  updateAccountButton();
  if (state.token && configured()) {
    try { const result = await api('/auth/v1/user'); state.user = result; await loadProfile(); }
    catch { if (await refreshSession()) await loadProfile(); else clearSession(); }
  }
  await loadPeople();
}
init();
