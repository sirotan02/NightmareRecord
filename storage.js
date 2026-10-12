import { emptyData, validateData } from './core.js';
export const KEY = 'nightmare-eater:v1';
export const RECOVERY_KEY = 'nightmare-eater:before-import';
export function readData(storage = localStorage) {
  const raw = storage.getItem(KEY);
  return raw ? validateData(JSON.parse(raw)) : emptyData();
}
export function writeData(data, storage = localStorage) {
  storage.setItem(KEY, JSON.stringify(data));
}
export function recoverableImport(previous, next, storage = localStorage) {
  storage.setItem(RECOVERY_KEY, JSON.stringify(previous));
  writeData(next, storage);
}
