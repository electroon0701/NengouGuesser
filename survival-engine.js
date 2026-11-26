/*
 * Pure survival-round resolver shared by the online game and automated tests.
 * It deliberately performs no Firebase reads/writes and has no UI side effects.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChronosSurvivalEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function resolveRound({
    hpBefore,
    answers,
    maxHp,
    damageFor,
    bonusFor,
    incomingDamageFactor = () => 1
  }) {
    const sourceHp = hpBefore && typeof hpBefore === 'object' ? hpBefore : {};
    const answerRows = answers && typeof answers === 'object' ? answers : {};
    const cap = Math.max(1, Math.floor(Number(maxHp) || 1));
    const hp = {};
    const baseDamage = {};
    const bonusDamage = {};
    const healing = {};
    const activeIds = Object.keys(sourceHp).filter(id => Number(sourceHp[id]) > 0);

    for (const id of Object.keys(sourceHp)) {
      const before = Math.max(0, Math.min(cap, Math.floor(Number(sourceHp[id]) || 0)));
      hp[id] = before;
      baseDamage[id] = 0;
      bonusDamage[id] = 0;
      healing[id] = 0;
    }

    // First resolve each player's normal answer damage.
    for (const id of activeIds) {
      const answer = answerRows[id] || null;
      const raw = Math.max(0, Number(damageFor(answer, id)) || 0);
      const factor = Math.max(0, Number(incomingDamageFactor(id)) || 0);
      const requested = Math.max(0, Math.round(raw * factor));
      const applied = Math.min(hp[id], requested);
      baseDamage[id] = applied;
      hp[id] = Math.max(0, hp[id] - applied);
    }

    // Then resolve all precision attacks at once. A missing/invalid target is ignored.
    const pendingAttacks = {};
    const pendingHealing = {};
    for (const attackerId of activeIds) {
      const answer = answerRows[attackerId] || null;
      if (!answer) continue;
      const rawBonus = Math.max(0, Number(bonusFor(answer, attackerId)) || 0);
      const targetId = answer.targetUid;
      if (rawBonus <= 0 || typeof targetId !== 'string' || !Object.prototype.hasOwnProperty.call(hp, targetId)) continue;
      if (hp[attackerId] <= 0) continue; // eliminated attackers cannot act or revive themselves
      if (targetId === attackerId) {
        pendingHealing[attackerId] = (pendingHealing[attackerId] || 0) + rawBonus;
      } else if (hp[targetId] > 0) {
        const factor = Math.max(0, Number(incomingDamageFactor(targetId)) || 0);
        const amount = Math.max(0, Math.round(rawBonus * factor));
        pendingAttacks[targetId] = (pendingAttacks[targetId] || 0) + amount;
      }
    }

    for (const [targetId, requested] of Object.entries(pendingAttacks)) {
      const applied = Math.min(hp[targetId], requested);
      bonusDamage[targetId] = applied;
      hp[targetId] = Math.max(0, hp[targetId] - applied);
    }

    // Healing is applied after attacks, is capped at initial HP, and never revives a player.
    for (const [playerId, requested] of Object.entries(pendingHealing)) {
      if (hp[playerId] <= 0) continue;
      const applied = Math.min(Math.max(0, cap - hp[playerId]), requested);
      healing[playerId] = applied;
      hp[playerId] = Math.min(cap, hp[playerId] + applied);
    }

    const survivedRoundsDelta = {};
    for (const id of Object.keys(hp)) survivedRoundsDelta[id] = hp[id] > 0 ? 1 : 0;
    const aliveCount = Object.values(hp).filter(value => value > 0).length;
    return { hp, baseDamage, bonusDamage, healing, survivedRoundsDelta, aliveCount };
  }

  function countAlive(hpMap) {
    return Object.values(hpMap || {}).filter(value => Number(value) > 0).length;
  }

  return Object.freeze({ resolveRound, countAlive });
});
