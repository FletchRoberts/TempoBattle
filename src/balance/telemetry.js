// Shop telemetry for the balance tool: what bots were offered and what they took.
// Off unless a tool turns it on, so normal pool builds pay nothing for it.
export const T = { on: false, offered: {}, bought: {}, artOffered: {}, artPicked: {}, modOffered: {}, modBought: {}, shopStyle: {} };

export function resetTelemetry(on = true) {
  T.on = on;
  for (const k of ['offered', 'bought', 'artOffered', 'artPicked', 'modOffered', 'modBought', 'shopStyle']) T[k] = {};
}
export function tel(kind, id) {
  if (!T.on) return;
  T[kind][id] = (T[kind][id] || 0) + 1;
}
// Record every item / modifier offer in a freshly rolled shop.
export function telShop(offers) {
  if (!T.on) return;
  for (const o of offers) {
    if (o.kind === 'item') tel('offered', o.inst.id);
    else if (o.kind === 'mod') tel('modOffered', o.id);
  }
}
