/* Local CPU policy shared by standard, survival, half and poker modes. */
(function (root) {
  "use strict";
  const TIERS = Object.freeze({
    beginner: Object.freeze({label:"初学者",mastery:[.42,.20,.09,.035,.015],memoryNoise:.20,hedgeRate:.28,bluffRate:.055,callRate:.48,reactionMinMs:450,reactionMaxMs:1250}),
    exam_candidate: Object.freeze({label:"受験生",mastery:[.72,.48,.27,.15,.08],memoryNoise:.15,hedgeRate:.22,bluffRate:.075,callRate:.53,reactionMinMs:450,reactionMaxMs:1250}),
    major: Object.freeze({label:"専攻生",mastery:[.88,.76,.52,.31,.19],memoryNoise:.115,hedgeRate:.17,bluffRate:.1,callRate:.58,reactionMinMs:450,reactionMaxMs:1250}),
    historian: Object.freeze({label:"歴史学者",mastery:[.95,.90,.78,.55,.38],memoryNoise:.085,hedgeRate:.13,bluffRate:.12,callRate:.61,reactionMinMs:450,reactionMaxMs:1250})
  });
  const PERSONALITY_DEFAULTS = Object.freeze({memory:.5,intuition:.5,aggression:.43,caution:.55,curiosity:.52,thrift:.56,variability:.44,shopping:.48,strategy:.5});
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
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

  function create(level = "beginner", rng = Math.random, personality = null) {
    const profile = TIERS[level] || TIERS.beginner, traits=normalizePersonality(personality);
    return Object.freeze({
      level, personality:traits,
      thinkDelay: () => Math.round(rand(rng, profile.reactionMinMs, profile.reactionMaxMs) * (.8 + traits.variability*.45)),
      answer(question, minYear = -1999, maxYear = new Date().getFullYear()) {
        const truth = Number(question?.year);
        if (!Number.isFinite(truth)) return Math.round(rand(rng, minYear, maxYear));
        const effects=question?.cpuEffects||{},scale = difficultyScale(question), tierIndex=scale<.86?0:scale<1.1?1:scale<1.32?2:scale<1.52?3:4;
        const mastery=profile.mastery[tierIndex],blindStrength=clamp(Number(effects.blindStrength??(effects.blind ? .35 : 0)),0,.85),oilStrength=clamp(Number(effects.oilStrength??(effects.oil ? .35 : 0)),0,.85),impairment=clamp(blindStrength*.95+oilStrength*.8,0,.84),recognition=mastery*(.72+traits.memory*.28)*(1-impairment);
        const recognizes=rng()<clamp(recognition,.005,.98);
        const exactChance = recognizes ? clamp((.42+mastery*.22)*(1-impairment*.92),.06,.65) : clamp(.006+impairment*.065,.006,.08);
        if (rng() < exactChance) return Math.round(clamp(truth, minYear, maxYear));
        let width = (recognizes ? 100+profile.memoryNoise*180 : 500- (profile.mastery[0]+profile.mastery[1]+profile.mastery[2])*48) * scale * (1.12-traits.intuition*.4) * (1+traits.variability*.45) * (1+impairment*3.1);
        if(effects.radar)width*=.72;
        if(effects.century)width*=.84;
        let estimate = truth + normal(rng) * width * (0.68 + rng() * profile.memoryNoise * (1.2-traits.memory*.4));
        if (rng() < profile.hedgeRate*(.75+traits.variability*.65)) estimate = estimate * (0.84 + rng() * 0.32);
        const hint=effects.radarRange||effects.centuryRange;
        if(hint&&Number.isFinite(Number(hint.start))&&Number.isFinite(Number(hint.end))){const low=Math.min(Number(hint.start),Number(hint.end)),high=Math.max(Number(hint.start),Number(hint.end));estimate=clamp(estimate,low,high);if(rng()<.3)estimate=rand(rng,low,high)}
        return Math.round(clamp(estimate, minYear, maxYear));
      },
      reviseAnswer(previous, question, minYear=-1999, maxYear=new Date().getFullYear()) {
        const old=Number(previous),fresh=this.answer(question,minYear,maxYear);
        if(!Number.isFinite(old))return fresh;
        const confidence=.18+traits.curiosity*.22+(1-traits.variability)*.08;
        return Math.round(clamp(old+(fresh-old)*confidence+normal(rng)*(1-traits.intuition)*18,minYear,maxYear));
      },
      answerDate(question, guessedYear) {
        const months=Number(question?.month),days=Number(question?.day);
        if(!Number.isInteger(months)||!Number.isInteger(days))return null;
        const scale=difficultyScale(question),tierIndex=scale<.86?0:scale<1.1?1:scale<1.32?2:scale<1.52?3:4,mastery=profile.mastery[tierIndex],effects=question?.cpuEffects||{},impairment=clamp(clamp(Number(effects.blindStrength??(effects.blind ? .35 : 0)),0,.85)*.95+clamp(Number(effects.oilStrength??(effects.oil ? .35 : 0)),0,.85)*.8,0,.84),recallChance=clamp((mastery*.25+traits.memory*.12)*(1-impairment),.005,.35);
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
    if(mode==="half_individual"||mode==="half_team")return ["radar","tailwind","oracle","century","goblin_blind","demon_blind","oil_bottle","super_oil_bottle","grudge_charm","malevolence_charm","onigiri","berserker_blind","egoma_oil"].includes(id);
    return phase==="answering"&&["radar","tailwind","oracle","century","goblin_blind","demon_blind","oil_bottle","super_oil_bottle","grudge_charm","malevolence_charm","onigiri","berserker_blind","egoma_oil"].includes(id);
  }
  root.TimePokerCPU = Object.freeze({ create, tiers: TIERS, personalityDefaults:PERSONALITY_DEFAULTS, normalizePersonality, randomPersonality, itemAllowed });
})(typeof window === "undefined" ? globalThis : window);
