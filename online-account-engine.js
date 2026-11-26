/* Personal learning-record and future badge helpers. No Firebase or UI dependencies. */
(function(global){
  "use strict";
  const BADGE_METRICS = Object.freeze([
    "matchesCompleted", "answers", "yearHits", "exactDateHits", "dateAttempts",
    "standardMatches", "survivalMatches", "senjinMatches", "half_individualMatches", "half_teamMatches", "pokerMatches",
    "firstPlaces", "top3Finishes", "winFinishes", "ssFinishes", "sFinishes", "aFinishes", "incredibleFinishes",
    "standardAnswers", "survivalAnswers", "senjinAnswers", "half_individualAnswers", "half_teamAnswers", "pokerAnswers", "pokerWins",
    "multiplayerFirstPlaces", "multiplayerTies", "sOrBetterFinishes", "perfectHits_basic", "perfectHits_standard", "perfectHits_advanced", "perfectHits_super_advanced", "perfectHits_hell", "perfectYearOnlyHits", "perfectMonthDayHits", "cpuWins_beginner", "cpuWins_exam_candidate", "cpuWins_major", "cpuWins_historian", "cpuWins_god"
  ]);
  function safeKey(value){
    const bytes=new TextEncoder().encode(String(value??""));
    let binary=""; for(const byte of bytes) binary+=String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  }
  function buildAttempt(question, answer, mode, at=Date.now()){
    if(!question||!answer||!Number.isFinite(Number(answer.year))) return null;
    const correctYear=question.era==="BCE" ? 1-Number(question.year) : Number(question.year);
    const year=Number(answer.year),yearGap=Math.abs(year-correctYear),hasDate=question.month!=null&&question.day!=null&&Number.isInteger(Number(question.month))&&Number.isInteger(Number(question.day));
    const yearHit=year===correctYear;
    const exactDateHit=Boolean(hasDate&&yearHit&&Number(answer.month)===Number(question.month)&&Number(answer.day)===Number(question.day));
    return {
      questionId:String(question.id), mode:String(mode||"unknown"), at:Number(at)||Date.now(),
      guessedYear:year, correctYear, yearGap, yearHit,
      hasDate, guessedMonth:answer.month!=null&&Number.isInteger(Number(answer.month))?Number(answer.month):null,
      guessedDay:answer.day!=null&&Number.isInteger(Number(answer.day))?Number(answer.day):null,
      correctMonth:hasDate?Number(question.month):null, correctDay:hasDate?Number(question.day):null,
      exactDateHit, category:String(question.category||"未設定").slice(0,50),
      period:String(question.period||"未設定").slice(0,50), level:String(question.level||"標準").slice(0,50)
    };
  }
  function mergeQuestionStats(current, incoming, sourceUid){
    const old=current&&typeof current==="object"?current:{};
    const migrated=Array.isArray(old.migratedFrom)?old.migratedFrom:[];
    if(sourceUid&&migrated.includes(sourceUid)) return old;
    const recentMap=new Map();
    for(const item of [...(Array.isArray(old.recentAttempts)?old.recentAttempts:[]),...(Array.isArray(incoming.recentAttempts)?incoming.recentAttempts:[])]){
      if(item&&item.eventId) recentMap.set(item.eventId,item);
    }
    const out={
      schemaVersion:1,
      questionId:String(old.questionId||incoming.questionId||""),
      attempts:(Number(old.attempts)||0)+(Number(incoming.attempts)||0),
      yearHits:(Number(old.yearHits)||0)+(Number(incoming.yearHits)||0),
      exactDateHits:(Number(old.exactDateHits)||0)+(Number(incoming.exactDateHits)||0),
      dateAttempts:(Number(old.dateAttempts)||0)+(Number(incoming.dateAttempts)||0),
      totalYearGap:(Number(old.totalYearGap)||0)+(Number(incoming.totalYearGap)||0),
      bestYearGap:Math.min(Number.isFinite(Number(old.bestYearGap))?Number(old.bestYearGap):Infinity,Number.isFinite(Number(incoming.bestYearGap))?Number(incoming.bestYearGap):Infinity),
      lastAttemptAt:Math.max(Number(old.lastAttemptAt)||0,Number(incoming.lastAttemptAt)||0),
      modeCounts:{...(old.modeCounts||{})},
      category:String(old.category||incoming.category||"未設定"),
      period:String(old.period||incoming.period||"未設定"),
      level:String(old.level||incoming.level||"標準"),
      perfectHitsByLevel:Object.fromEntries(["基礎","標準","発展","超発展","ヘル"].map(level=>[level,(Number(old.perfectHitsByLevel?.[level])||0)+(Number(incoming.perfectHitsByLevel?.[level])||0)])),
      perfectYearOnlyHits:(Number(old.perfectYearOnlyHits)||0)+(Number(incoming.perfectYearOnlyHits)||0),
      perfectMonthDayHits:(Number(old.perfectMonthDayHits)||0)+(Number(incoming.perfectMonthDayHits)||0),
      processedEventIds:[...new Set([...(Array.isArray(old.processedEventIds)?old.processedEventIds:[]),...(Array.isArray(incoming.processedEventIds)?incoming.processedEventIds:[])])],
      recentAttempts:[...recentMap.values()].sort((a,b)=>(Number(a.at)||0)-(Number(b.at)||0)).slice(-20),
      migratedFrom:sourceUid?[...new Set([...migrated,sourceUid])]:migrated
    };
    for(const [mode,count] of Object.entries(incoming.modeCounts||{})) out.modeCounts[mode]=(Number(out.modeCounts[mode])||0)+(Number(count)||0);
    if(!Number.isFinite(out.bestYearGap)) out.bestYearGap=0;
    return out;
  }
  function buildMatchMetrics(matches){
    const rows=Array.isArray(matches)?matches:Object.values(matches||{});
    const metrics={matchesCompleted:rows.length,firstPlaces:0,top3Finishes:0,multiplayerFirstPlaces:0,multiplayerTies:0,aFinishes:0,sFinishes:0,ssFinishes:0,incredibleFinishes:0};
    for(const match of rows){
      if(!match||typeof match!=="object")continue;
      if(match.mode)metrics[`${match.mode}Matches`]=(metrics[`${match.mode}Matches`]||0)+1;
      const rank=Number(match.rank);
      if(Number.isInteger(rank)&&rank>0){
        if(rank===1)metrics.firstPlaces++;
        if(rank<=3)metrics.top3Finishes++;
        metrics[`rank${rank}Finishes`]=(metrics[`rank${rank}Finishes`]||0)+1;
        if(match.rankKey){metrics[`${match.rankKey}Finishes`]=(metrics[`${match.rankKey}Finishes`]||0)+1;if(match.mode)metrics[`${match.mode}_${match.rankKey}Finishes`]=(metrics[`${match.mode}_${match.rankKey}Finishes`]||0)+1;}
        if(rank===1&&match.mode)metrics[`${match.mode}Wins`]=(metrics[`${match.mode}Wins`]||0)+1;
        if(Number(match.humanParticipantCount)>=2&&(rank===1||match.multiplayerFirstPlace===true))metrics.multiplayerFirstPlaces++;
      }
      if(match.tiedWithHuman===true)metrics.multiplayerTies++;
      for(const level of Array.isArray(match.cpuWins)?match.cpuWins:[])if(typeof level==="string"&&/^[a-z_]+$/.test(level))metrics[`cpuWins_${level}`]=(metrics[`cpuWins_${level}`]||0)+1;
    }
    return metrics;
  }
  function aggregatePerfectHitMetrics(questionStats){
    const metrics={perfectHits_basic:0,perfectHits_standard:0,perfectHits_advanced:0,perfectHits_super_advanced:0,perfectHits_hell:0,perfectYearOnlyHits:0,perfectMonthDayHits:0};
    const levelKeys={"基礎":"basic","標準":"standard","発展":"advanced","超発展":"super_advanced","ヘル":"hell"};
    for(const row of Object.values(questionStats||{})){
      const hits=row?.perfectHitsByLevel||{};
      for(const [level,key] of Object.entries(levelKeys))metrics[`perfectHits_${key}`]+=Number(hits[level])||0;
      metrics.perfectYearOnlyHits+=Number(row?.perfectYearOnlyHits)||0;
      metrics.perfectMonthDayHits+=Number(row?.perfectMonthDayHits)||0;
    }
    return metrics;
  }
  function meetsBadgeCondition(condition,metrics){
    if(!condition||!condition.metric)return false;
    const value=Number(metrics?.[condition.metric])||0,threshold=Math.max(0,Number(condition.threshold)||0);
    const operator=condition.operator||">=";
    if(operator===">")return value>threshold;
    if(operator==="===")return value===threshold;
    if(operator==="<=")return value<=threshold;
    return value>=threshold;
  }
  function meetsBadgeRule(definition,metrics){
    if(!definition||typeof definition.id!=="string")return false;
    if(Array.isArray(definition.allOf)&&definition.allOf.length)return definition.allOf.every(condition=>meetsBadgeCondition(condition,metrics));
    if(Array.isArray(definition.anyOf)&&definition.anyOf.length)return definition.anyOf.some(condition=>meetsBadgeCondition(condition,metrics));
    return meetsBadgeCondition(definition,metrics);
  }
  global.ChronosOnlineAccountEngine=Object.freeze({BADGE_METRICS,safeKey,buildAttempt,mergeQuestionStats,buildMatchMetrics,aggregatePerfectHitMetrics,meetsBadgeRule,meetsBadgeCondition});
})(window);
