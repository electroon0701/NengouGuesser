/* Local CPU policy shared by standard, survival, half and poker modes. */
(function (root) {
  "use strict";
  const TIERS = Object.freeze({
    beginner: Object.freeze({label:"初学者",mastery:[.42,.20,.09,.035,.015],memoryNoise:.20,hedgeRate:.28,bluffRate:.055,callRate:.48,reactionMinMs:450,reactionMaxMs:1250}),
    exam_candidate: Object.freeze({label:"受験生",mastery:[.82,.60,.38,.22,.12],memoryNoise:.15,hedgeRate:.22,bluffRate:.075,callRate:.53,reactionMinMs:450,reactionMaxMs:1250}),
    major: Object.freeze({label:"専攻生",mastery:[.92,.84,.66,.46,.31],memoryNoise:.115,hedgeRate:.17,bluffRate:.1,callRate:.58,reactionMinMs:450,reactionMaxMs:1250}),
    historian: Object.freeze({label:"歴史学者",mastery:[.95,.90,.78,.55,.38],memoryNoise:.085,hedgeRate:.13,bluffRate:.12,callRate:.61,reactionMinMs:450,reactionMaxMs:1250}),
    god: Object.freeze({label:"現人神",mastery:[1,1,1,1,1],memoryNoise:0,hedgeRate:0,bluffRate:.12,callRate:.61,reactionMinMs:450,reactionMaxMs:1250})
  });
  const DEFAULT_MASTERY=Object.freeze(Object.fromEntries(Object.entries(TIERS).map(([id,profile])=>[id,Object.freeze([...profile.mastery])])));
  let masteryOverrides=Object.fromEntries(Object.entries(DEFAULT_MASTERY).map(([id,values])=>[id,[...values]]));
  const PERSONALITY_DEFAULTS = Object.freeze({memory:.5,intuition:.5,aggression:.43,caution:.55,curiosity:.52,thrift:.56,variability:.44,shopping:.48,strategy:.5});
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const PERIOD_BANDS = Object.freeze({"古代":[-1700,1100],"中世":[900,1550],"近世":[1350,1850],"最近世":[1750,1960],"現代史":[1900,new Date().getFullYear()]});
  const ERA_CROSS_CHANCE = Object.freeze({beginner:.10,exam_candidate:.065,major:.035,historian:.015,god:0});
  function eraBounds(question,minYear,maxYear){
    const era=String(question?.era||"").toUpperCase();
    if(era==="BCE")return [Math.min(minYear,-1),-1];
    if(era==="CE")return [0,Math.max(maxYear,0)];
    return [minYear,maxYear];
  }
  function periodBounds(question,minYear,maxYear){
    const [eraMin,eraMax]=eraBounds(question,minYear,maxYear);
    const band=PERIOD_BANDS[String(question?.period||"")];
    if(!band)return [eraMin,eraMax];
    const lo=Math.max(eraMin,band[0]),hi=Math.min(eraMax,band[1]);
    // A period label is a soft historical cue, not an authority over an explicit era.
    // This is important for the one BCE question carrying「近世」and for ancient BCE
    // dates earlier than 1700 BCE. If the labels conflict, retain the whole era.
    return lo<=hi?[lo,hi]:[eraMin,eraMax];
  }
  function softEraPeriodBounds(question,minYear,maxYear){
    const [eraMin,eraMax]=eraBounds(question,minYear,maxYear);
    const era=String(question?.era||"").toUpperCase();
    const period=String(question?.period||"");
    if(era!=="BCE"&&era!=="CE")return [eraMin,eraMax];
    // For BCE, the dataset is sparse and its「古代」range extends beyond the old
    // -1700 cutoff. Keep the era as the safe envelope; use period only as a weak cue.
    if(era==="BCE")return [eraMin,eraMax];
    const band=PERIOD_BANDS[period];
    if(!band)return [eraMin,eraMax];
    const lo=Math.max(eraMin,band[0]),hi=Math.min(eraMax,band[1]);
    return lo<=hi?[lo,hi]:[eraMin,eraMax];
  }
  function crossEraGuess(era, minYear, maxYear, rng, profile, traits, truth){
    const targetEra=era==="BCE"?"CE":"BCE";
    const [lo,hi]=targetEra==="BCE"?[Math.min(minYear,-1),-1]:[0,Math.max(maxYear,0)];
    if(lo>hi)return null;
    // A mistaken era recognition should look like a human boundary mistake, not a
    // random teleport across the entire timeline. Bias the wrong-era guess toward
    // year 0, with a tier-dependent tail so weak CPUs can still make larger errors.
    const span=Math.max(1,Math.abs(hi-lo));
    const tail=clamp(.16 + (1-(profile.mastery?.[0]||0))*.32 + traits.variability*.18, .16, .58);
    const u=rng(), distance=Math.max(1,Math.round(Math.pow(u,1.8-tail)*Math.min(span,500)));
    let guess=targetEra==="BCE" ? -distance : distance;
    // For questions near the era boundary, allow ordinary noise to dominate.
    if(Math.abs(truth)<=80)guess=Math.round(truth + (targetEra==="BCE"?-1:1)*Math.max(1,Math.abs(normal(rng))*45));
    return Math.round(clamp(guess,lo,hi));
  }
  const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
  const normal = rng => (rand(rng, 0, 1) + rand(rng, 0, 1) + rand(rng, 0, 1) - 1.5) * 1.633;
  const normalizePersonality = value => Object.fromEntries(Object.entries(PERSONALITY_DEFAULTS).map(([key,fallback]) => [key,clamp(Number.isFinite(Number(value?.[key]))?Number(value[key]):fallback,0,1)]));
  function randomPersonality(rng=Math.random){return Object.fromEntries(Object.entries(PERSONALITY_DEFAULTS).map(([key,center])=>[key,Math.round(clamp(center+normal(rng)*.105,.28,.72)*100)/100]))}

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

  function normalizeMasteryOverrides(value){return Object.fromEntries(Object.entries(DEFAULT_MASTERY).map(([id,defaults])=>[id,defaults.map((fallback,index)=>{const n=Number(value?.[id]?.[index]);return clamp(Number.isFinite(n)?n:fallback,0,.98)})]))}
  function setMasteryOverrides(value){masteryOverrides=normalizeMasteryOverrides(value);return Object.fromEntries(Object.entries(masteryOverrides).map(([id,values])=>[id,[...values]]))}
  function create(level = "beginner", rng = Math.random, personality = null, skill = null, masteryProfile = null) {
    const profile = TIERS[level] || TIERS.beginner, mastery=Array.isArray(masteryProfile)&&masteryProfile.length===5?masteryProfile.map(value=>clamp(Number(value)||0,0,.98)):masteryOverrides[level]||profile.mastery, traits=normalizePersonality(personality), skillFactor=Number.isFinite(Number(skill))?.45+clamp(Number(skill),0,100)/100*1.1:1;
    return Object.freeze({
      level, personality:traits, skill:skill==null?null:clamp(Number(skill),0,100),
      thinkDelay: () => Math.round(rand(rng, profile.reactionMinMs, profile.reactionMaxMs) * (.8 + traits.variability*.45)),
      answer(question, minYear = -1999, maxYear = new Date().getFullYear()) {
        let [periodMin,periodMax]=softEraPeriodBounds(question,minYear,maxYear);
        const truth = Number(question?.year);
        if (!Number.isFinite(truth)) return Math.round(rand(rng, periodMin, periodMax));
        const effects=question?.cpuEffects||{},scale = difficultyScale(question), tierIndex=scale<.86?0:scale<1.1?1:scale<1.32?2:scale<1.52?3:4;
        const era=String(question?.era||"").toUpperCase();
        const eraAware=(era==="BCE"||era==="CE");
        const adjustedMastery=clamp(mastery[tierIndex]*skillFactor,.005,.98),blindStrength=clamp(Number(effects.blindStrength??(effects.blind ? .35 : 0)),0,.85),oilStrength=clamp(Number(effects.oilStrength??(effects.oil ? .35 : 0)),0,.85),impairment=clamp(blindStrength*.95+oilStrength*.8,0,.84),recognition=adjustedMastery*(.72+traits.memory*.28)*(1-impairment);
        const recognizes=rng()<clamp(recognition,.005,.98);
        const exactChance = recognizes ? clamp((.42+adjustedMastery*.22)*(1-impairment*.92),.06,.65) : clamp(.006+impairment*.065,.006,.08);
        if (rng() < exactChance) return Math.round(clamp(truth, periodMin, periodMax));

        // Era recognition is intentionally fallible. Most mistakes stay inside the
        // correct era; a small, tier-scaled fraction crosses year 0. A cross-era
        // mistake is boundary-biased, so「紀元前1800年→西暦2000年」のような
        // gameplay-breaking guesses do not occur merely because the CPU was weak.
        const crossChance=eraAware ? ERA_CROSS_CHANCE[level]*(.72+traits.variability*.45)*(1+impairment*.55) : 0;
        if(eraAware && rng()<clamp(crossChance,0,.18)){
          const cross=crossEraGuess(era,minYear,maxYear,rng,profile,traits,truth);
          if(cross!==null)return cross;
        }

        let width = ((recognizes ? 100+profile.memoryNoise*180 : 500- (mastery[0]+mastery[1]+mastery[2])*48)/skillFactor) * scale * (1.12-traits.intuition*.4) * (1+traits.variability*.45) * (1+impairment*3.1);
        if(effects.radar)width*=.5;
        if(effects.century)width*=.68;
        // Historical errors are wider in BCE, but still centered on the signed truth.
        // The era envelope below prevents normal noise from crossing year 0 by accident.
        if(era==="BCE")width*=.72;
        let estimate = truth + normal(rng) * width * (0.68 + rng() * profile.memoryNoise * (1.2-traits.memory*.4));
        if (rng() < profile.hedgeRate*(.75+traits.variability*.65)) estimate = estimate * (0.84 + rng() * 0.32);
        // Plausibility envelope: keep weak CPU mistakes within a recognizable historical scale.
        if(eraAware){
          const baseError={beginner:650,exam_candidate:500,major:380,historian:280,god:0}[level]??650;
          const maxError=clamp(baseError*scale*(1+impairment*.3),baseError*.75,baseError*1.75);
          estimate=clamp(estimate,truth-maxError,truth+maxError);
        }
        const hint=effects.radarRange||effects.centuryRange;
        if(hint&&Number.isFinite(Number(hint.start))&&Number.isFinite(Number(hint.end))){const low=Math.min(Number(hint.start),Number(hint.end)),high=Math.max(Number(hint.start),Number(hint.end));estimate=clamp(estimate,low,high);if(rng()<(effects.radarRange?.78:.62))estimate=rand(rng,low,high)}
        if(eraAware){const [eraMin,eraMax]=eraBounds(question,minYear,maxYear);return Math.round(clamp(estimate,eraMin,eraMax));}
        return Math.round(clamp(estimate,periodMin,periodMax));
      },
      reviseAnswer(previous, question, minYear=-1999, maxYear=new Date().getFullYear()) {
        const [periodMin,periodMax]=softEraPeriodBounds(question,minYear,maxYear);
        const old=Number(previous),fresh=this.answer(question,minYear,maxYear);
        if(!Number.isFinite(old))return fresh;
        const confidence=.18+traits.curiosity*.22+(1-traits.variability)*.08;
        return Math.round(clamp(old+(fresh-old)*confidence+normal(rng)*(1-traits.intuition)*18,periodMin,periodMax));
      },
      answerDate(question, guessedYear) {
        const months=Number(question?.month),days=Number(question?.day);
        if(!Number.isInteger(months)||!Number.isInteger(days))return null;
        if(level==="god")return {month:months,day:days};
        const scale=difficultyScale(question),tierIndex=scale<.86?0:scale<1.1?1:scale<1.32?2:scale<1.52?3:4,recallMastery=mastery[tierIndex],effects=question?.cpuEffects||{},impairment=clamp(clamp(Number(effects.blindStrength??(effects.blind ? .35 : 0)),0,.85)*.95+clamp(Number(effects.oilStrength??(effects.oil ? .35 : 0)),0,.85)*.8,0,.84),recallChance=clamp((recallMastery*.25+traits.memory*.12)*(1-impairment),.005,.35);
        if(Number(guessedYear)===Number(question.year)&&rng()<recallChance)return {month:months,day:days};
        const month=1+Math.floor(rng()*12),year=Math.abs(Number(guessedYear)||1),leap=year%4===0&&(year%100!==0||year%400===0),length=month===2?(leap?29:28):([4,6,9,11].includes(month)?30:31);
        return {month,day:1+Math.floor(rng()*length)};
      },
      action({ toCall = 0, points = 1000, confidence = 0.35, currentBet = 0 } = {}) {
        const payable = Math.max(0, Math.min(Number(points) || 0, Number(toCall) || 0));
        const c = clamp(Number(confidence) || 0, 0, 1);
        if (payable === 0) {
          if (rng() < profile.bluffRate*(.45+traits.aggression)) return { type: "bet", amount: Math.min(points, 50) };
          return { type: "check" };
        }
        const callChance=clamp(profile.callRate+c*.24+(traits.aggression-.5)*.22-(traits.caution-.5)*.28,.08,.88);
        if(c<.13&&rng()>profile.bluffRate*(.5+traits.aggression))return {type:"fold"};
        if(rng()<callChance)return {type:"call",amount:payable};
        if(traits.aggression>.68&&c>.48&&rng()<.22)return {type:"bet",amount:payable};
        return {type:"fold"};
      },
      chooseItem({items=[],mode="standard",phase="answering",confidence=.35,opponentCount=1,points=1000,leaderPoints=0,remainingQuestions=1}={}) {
        const usable=items.filter(x=>x&&!x.used&&itemAllowed(x.id,mode,phase));
        if(!usable.length)return null;
        const chance=clamp(.04+traits.curiosity*.14+traits.shopping*.28+traits.strategy*.4+(1-traits.thrift)*.1,.03,.9);
        if(rng()>chance)return null;
        const weighted=usable.map(item=>{
          let value=.35;
          if(["oracle","radar","century","insight","omniscience"].includes(item.id))value=.42+(1-confidence)*.48+traits.curiosity*.35+traits.strategy*.22;
          if(["tailwind","onigiri","berserker_blind","egoma_oil"].includes(item.id))value=.44+confidence*.22+traits.aggression*.24+traits.strategy*.12;
          if(["goblin_blind","demon_blind","oil_bottle","super_oil_bottle","grudge_charm","malevolence_charm","edict"].includes(item.id))value=.3+Math.min(1,opponentCount/2)*.26+traits.aggression*.25+traits.strategy*(Number(leaderPoints) > Number(points) ? .42 : .22);
          if(item.id==="time_leap")value=.45+(1-confidence)*.28+traits.curiosity*.22;
          if(item.id==="disguise")value=.25+traits.aggression*.16;
          if(["oracle","super_oil_bottle","omniscience","edict"].includes(item.id))value*=.72+traits.strategy*.24;
          if(remainingQuestions<=1&&traits.thrift>.65&&!(["oracle","tailwind","onigiri","berserker_blind","egoma_oil"].includes(item.id)))value*=.64;
          return {item,weight:Math.max(.05,value)*(0.7+rng()*.6)};
        });
        const total=weighted.reduce((sum,x)=>sum+x.weight,0);let roll=rng()*total;
        for(const choice of weighted){roll-=choice.weight;if(roll<=0)return choice.item}
        return weighted[weighted.length-1].item;
      }
    });
  }
  function itemAllowed(id,mode,phase){
    if(mode==="poker")return true;
    if(["insight","omniscience","edict","disguise","time_leap"].includes(id))return false;
    if(mode==="half_individual"||mode==="half_team")return ["radar","tailwind","oracle","century","goblin_blind","demon_blind","oil_bottle","super_oil_bottle","grudge_charm","malevolence_charm","onigiri","berserker_blind","egoma_oil","self_binding"].includes(id);
    return phase==="answering"&&["radar","tailwind","oracle","century","goblin_blind","demon_blind","oil_bottle","super_oil_bottle","grudge_charm","malevolence_charm","onigiri","berserker_blind","egoma_oil","self_binding"].includes(id);
  }
  root.TimePokerCPU = Object.freeze({ create, tiers: TIERS, masteryDefaults:DEFAULT_MASTERY, normalizeMasteryOverrides, setMasteryOverrides, personalityDefaults:PERSONALITY_DEFAULTS, normalizePersonality, randomPersonality, itemAllowed });
})(typeof window === "undefined" ? globalThis : window);
