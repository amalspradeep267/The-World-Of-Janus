import { generateCredentials } from '@boardgame.io/p2p';
import type { Settings } from '../game/types';

// Rooms live entirely in the URL hash, so the address bar is the invite link:
//   #/room/KXQTM?p=Amal,Ben,Cara        (add &hide=1 to keep exposed factions secret)
// Which seat you are and whether you're the host are remembered per browser.

export type Route =
  | { page: 'home' }
  | { page: 'practice'; players: number }
  | { page: 'room'; code: string; roster: string[]; settings: Settings };

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'practice') return { page: 'practice', players: Number(params.get('n')) || 4 };
  if (parts[0] === 'room' && parts[1]) {
    const roster = (params.get('p') ?? '').split(',').map(decodeURIComponent).filter(Boolean);
    return { page: 'room', code: parts[1].toUpperCase(), roster, settings: { revealFaction: params.get('hide') !== '1' } };
  }
  return { page: 'home' };
}

export const roomHash = (code: string, roster: string[], settings: Settings) =>
  `#/room/${code}?p=${roster.map(encodeURIComponent).join(',')}${settings.revealFaction ? '' : '&hide=1'}`;

export const roomLink = (code: string, roster: string[], settings: Settings) =>
  `${location.origin}${location.pathname}${roomHash(code, roster, settings)}`;

export function newRoomCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, to avoid confusion
  return Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

const key = (code: string, what: string) => `utt:${code}:${what}`;

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: the seat just won't be remembered */
  }
}

export const getSeat = (code: string) => read(key(code, 'seat'));
export const setSeat = (code: string, seat: string) => write(key(code, 'seat'), seat);
export const isHost = (code: string) => read(key(code, 'host')) === '1';
export const markHost = (code: string) => write(key(code, 'host'), '1');

/** Credentials lock a seat to this browser, so nobody else can join as you. */
export function getCredentials(code: string): string {
  let c = read(key(code, 'creds'));
  if (!c) {
    c = generateCredentials();
    write(key(code, 'creds'), c);
  }
  return c;
}
