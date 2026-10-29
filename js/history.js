// Deltas por identidade: restaurar uma exclusão não substitui todo o cadastro atual.
const clone = value => value === undefined ? null : structuredClone(value);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const keyed = array => Array.isArray(array) && array.every(item => item && typeof item.id === 'string');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function changesBetween(before, after, path = []) {
  if (same(before, after)) return [];
  if (keyed(before) && keyed(after)) {
    const ids = new Set([...before, ...after].map(item => item.id));
    return [...ids].flatMap(id => changesBetween(before.find(item => item.id === id), after.find(item => item.id === id), [...path, { id }]));
  }
  if (object(before) && object(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => changesBetween(before[key], after[key], [...path, key]));
  }
  return [{ path, before: clone(before), after: clone(after), beforeExists: before !== undefined, afterExists: after !== undefined }];
}
const contents = db => ({ groups: db.groups, personal: db.personal ?? null });
export function recordChange(before, after, label, context) {
  const patches = changesBetween(contents(before), contents(after));
  if (!patches.length) return;
  const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), label, context, patches };
  after.history = [...(after.history || []), entry].slice(-40);
  // Keep the most recent operation even when a large group was removed.
  while (after.history.length > 1 && JSON.stringify(after.history).length > 1_500_000) after.history.shift();
}
function locate(state, path) {
  let target = state;
  for (const segment of path.slice(0, -1)) {
    if (typeof segment === 'object') target = Array.isArray(target) ? target.find(item => item.id === segment.id) : undefined;
    else target = target && Object.hasOwn(target, segment) ? target[segment] : undefined;
    if (target == null) throw new Error('Um cadastro relacionado mudou. Desfaça primeiro as alterações mais recentes.');
  }
  const key = path.at(-1);
  if (typeof key === 'object') {
    if (!Array.isArray(target)) throw new Error('Histórico incompatível.');
    return { target, key: target.findIndex(item => item.id === key.id), array: true };
  }
  return { target, key, array: false };
}
export function undoChange(db, id) {
  const entry = db.history?.find(row => row.id === id);
  if (!entry || entry.undoneAt) throw new Error('Esta alteração já foi desfeita ou saiu do histórico.');
  const next = structuredClone(db);
  // Validate every expected value before applying any inverse operation.
  for (const patch of entry.patches) {
    const { target, key } = locate(next, patch.path);
    if (!same(target[key], patch.after)) throw new Error('Este item foi alterado depois. Desfaça as alterações mais recentes dele primeiro.');
  }
  for (const patch of [...entry.patches].reverse()) {
    const { target, key, array } = locate(next, patch.path);
    if (array) {
      if (!patch.beforeExists && key >= 0) target.splice(key, 1);
      else if (key < 0) target.push(clone(patch.before));
      else target[key] = clone(patch.before);
    } else if (!patch.beforeExists) delete target[key];
    else target[key] = clone(patch.before);
  }
  next.history.find(row => row.id === id).undoneAt = new Date().toISOString();
  if (!next.groups.some(g => g.id === next.activeGroupId)) next.activeGroupId = next.groups[0]?.id || null;
  return next;
}
export function validHistory(history) {
  if (!Array.isArray(history) || history.length > 40) return false;
  const safe = key => typeof key === 'string' && !['__proto__', 'constructor', 'prototype', 'history'].includes(key);
  return history.every(row => row && typeof row.id === 'string' && typeof row.label === 'string' && row.label.length < 500 && typeof row.at === 'string' && Array.isArray(row.patches) && row.patches.length < 100000 && row.patches.every(p => p && typeof p.beforeExists === 'boolean' && typeof p.afterExists === 'boolean' && Array.isArray(p.path) && p.path.length >= 1 && p.path.length < 20 && ['groups', 'personal'].includes(p.path[0]) && p.path.every(part => safe(part) || (part && typeof part === 'object' && safe(part.id)))));
}
