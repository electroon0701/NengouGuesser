/* Time Poker CPU policy. Kept independent from Firebase so higher tiers can reuse the interface. */
(function (root) {
  "use strict";
  const TIERS = Object.freeze({
    beginner: Object.freeze({label:"初学者",memoryRate:.35,memoryNoise:.21,hedgeRate:.34,bluffRate:.055,callRate:.48,reactionMinMs:1700,reactionMaxMs:5100}),
    exam_candidate: Object.freeze({label:"受験生",memoryRate:.42,memoryNoise:.2,hedgeRate:.26,bluffRate:.075,callRate:.53,reactionMinMs:1400,reactionMaxMs:4400}),
    major: Object.freeze({label:"専攻生",memoryRate:.56,memoryNoise:.17,hedgeRate:.2,bluffRate:.1,callRate:.58,reactionMinMs:1200,reactionMaxMs:3900}),
    historian: Object.freeze({label:"歴史学者",memoryRate:.68,memoryNoise:.14,hedgeRate:.16,bluffRate:.12,callRate:.61,reactionMinMs:1100,reactionMaxMs:3700})
  });
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
  const normal = rng => (rand(rng, 0, 1) + rand(rng, 0, 1) + rand(rng, 0, 1) - 1.5) * 1.633;

  function difficultyScale(question) {
    if (Number.isFinite(Number(question?.cpuDifficultyScale))) return clamp(Number(question.cpuDifficultyScale), .45, 2.5);
    if (Number.isFinite(Number(question?.difficultyRank))) return clamp(.72 + Number(question.difficultyRank) * .19, .45, 2.5);
    const label=String(question?.level||question?.difficulty||"");
    const known={"基礎":.72,"入門":.72,"標準":1,"発展":1.2,"超発展":1.4,"ヘル":1.65};
    if (known[label]) return known[label];
    if (/超|極|hell|地獄/i.test(label)) return 1.55;
    if (/発展|上級|expert/i.test(label)) return 1.25;
    if (/基礎|初級|入門|basic/i.test(label)) return .78;
    return 1;
  }
  function create(level = "beginner", rng = Math.random) {
    const profile = TIERS[level] || TIERS.beginner;
    return Object.freeze({
      level,
      thinkDelay: () => Math.round(rand(rng, profile.reactionMinMs, profile.reactionMaxMs)),
      answer(question, minYear = -1999, maxYear = 9999) {
        const truth = Number(question?.year);
        if (!Number.isFinite(truth)) return Math.round(rand(rng, minYear, maxYear));
        const scale = difficultyScale(question), remembers = rng() < profile.memoryRate;
        // A beginner has learned the historical timeline. Familiar or introductory
        // questions sometimes come back exactly; harder labels widen recall errors.
        const exactChance = clamp((remembers ? .36 : .018) / scale, .008, .3);
        if (rng() < exactChance) return Math.round(clamp(truth, minYear, maxYear));
        const width = (remembers ? 72 : 500) * scale;
        let estimate = truth + normal(rng) * width * (0.7 + rng() * profile.memoryNoise);
        if (rng() < profile.hedgeRate) estimate = estimate * (0.84 + rng() * 0.32);
        return Math.round(clamp(estimate, minYear, maxYear));
      },
      answerDate(question, guessedYear) {
        const months=Number(question?.month),days=Number(question?.day);
        if(!Number.isInteger(months)||!Number.isInteger(days))return null;
        const scale=difficultyScale(question),recallChance=clamp(profile.memoryRate*.24/scale,.015,.2);
        if(Number(guessedYear)===Number(question.year)&&rng()<recallChance)return {month:months,day:days};
        const month=1+Math.floor(rng()*12),year=Math.abs(Number(guessedYear)||1),leap=year%4===0&&(year%100!==0||year%400===0),length=month===2?(leap?29:28):([4,6,9,11].includes(month)?30:31);
        return {month,day:1+Math.floor(rng()*length)};
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
