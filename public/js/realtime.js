// Canlı olaylar: sunucudan gelen Server-Sent Events (EventSource) akışı.
// İstemci -> sunucu yönü normal fetch (api.js) ile gider; X-Client-Id başlığı bağlantıyı eşler.

import { state, emit } from './state.js';

const EVENTS = [
  'chat:message',
  'chat:typing',
  'chat:read',
  'member:joined',
  'member:left',
  'room:updated',
  'room:deleted',
  'room:kicked',
  'room:added',
  'friend:request',
  'friend:accepted',
  'friend:removed',
  'presence',
];

const handlers = new Map(); // olay adı -> Set<fn>
let source = null;

/** Olaya abone ol; geri dönen fonksiyon aboneliği kaldırır. */
export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => handlers.get(event)?.delete(fn);
}

function dispatch(event, payload) {
  const set = handlers.get(event);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.error('[realtime]', event, err);
    }
  }
}

export function connect() {
  if (source) return;
  const es = new EventSource('/api/events');
  source = es;

  es.addEventListener('hello', (e) => {
    state.clientId = JSON.parse(e.data).clientId;
    emit('kadro:rt-open');
  });
  for (const name of EVENTS) {
    es.addEventListener(name, (e) => {
      let payload = null;
      try {
        payload = JSON.parse(e.data);
      } catch {
        return;
      }
      dispatch(name, payload);
    });
  }
  es.onerror = () => {
    // EventSource kendi kendine yeniden bağlanır; yeni "hello" ile yeni clientId gelir.
    if (state.clientId) {
      state.clientId = '';
      emit('kadro:rt-close');
    }
    if (es.readyState === EventSource.CLOSED && source === es) source = null; // oturum bitmiş olabilir
  };
}

export function disconnect() {
  if (source) source.close();
  source = null;
  if (state.clientId) {
    state.clientId = '';
    emit('kadro:rt-close');
  }
}

/** clientId gelene kadar bekler (bağlantı kurulurken yapılan abonelikler için). */
export function whenReady(timeout = 6000) {
  if (state.clientId) return Promise.resolve(state.clientId);
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('kadro:rt-open', done);
      resolve(state.clientId);
    };
    const timer = setTimeout(() => {
      window.removeEventListener('kadro:rt-open', done);
      const err = new Error('no_realtime');
      err.code = 'no_realtime';
      reject(err);
    }, timeout);
    window.addEventListener('kadro:rt-open', done);
  });
}
