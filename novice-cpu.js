/* Time Poker CPU policy. Kept independent from Firebase so higher tiers can reuse the interface. */
(function (root) {
  "use strict";
  const TIERS = Object.freeze({
    beginner: Object.freeze({
      label: "初学者", memoryRate: 0.29, memoryNoise: 0.24,
      hedgeRate: 0.34, bluffRate: 0.055, callRate: 0.48,
      reactionMinMs: 1700, reactionMaxMs: 5100
    })
  });
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
  const normal = rng => (rand(rng, 0, 1) + rand(rng, 0, 1) + rand(rng, 0, 1) - 1.5) * 1.633;

  function create(level = "beginner", rng = Math.random) {
    const profile = TIERS[level] || TIERS.beginner;
    return Object.freeze({
      level,
      thinkDelay: () => Math.round(rand(rng, profile.reactionMinMs, profile.reactionMaxMs)),
      answer(question, minYear = -1999, maxYear = 9999) {
        const truth = Number(question?.year);
        if (!Number.isFinite(truth)) return Math.round(rand(rng, minYear, maxYear));
        // The beginner has a hazy timeline rather than precise dates. Strong and weak
        // recollection alternate, and even familiar facts can be misremembered.
        const remembers = rng() < profile.memoryRate;
        const width = remembers ? 95 : 820;
        let estimate = truth + normal(rng) * width * (0.55 + rng() * profile.memoryNoise);
        if (rng() < profile.hedgeRate) estimate = estimate * (0.72 + rng() * 0.56);
        return Math.round(clamp(estimate, minYear, maxYear));
      },
      action({ toCall = 0, points = 1000, confidence = 0.35, currentBet = 0 } = {}) {
        const payable = Math.max(0, Math.min(Number(points) || 0, Number(toCall) || 0));
        const c = clamp(Number(confidence) || 0, 0, 1);
        if (payable === 0) {
          if (currentBet > 0 && c < 0.19 && rng() < profile.bluffRate) return { type: "bet", amount: Math.min(points, 50) };
          return { type: "check" };
        }
        if (c < 0.1 && rng() > profile.bluffRate) return { type: "fold" };
        if (c < 0.23 && rng() > 0.2) return { type: "fold" };
        if (rng() < profile.callRate + c * 0.24) return { type: "call", amount: payable };
        return { type: "fold" };
      }
    });
  }
  root.TimePokerCPU = Object.freeze({ create, tiers: TIERS });
})(typeof window === "undefined" ? globalThis : window);
