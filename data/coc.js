export function resultCheck(cocRule, d100, attrValue, difficulty=1, options={}) {
  const bonus = options.skillBonus || 0;
  let checkVal = attrValue + bonus;
  switch(difficulty) {
    case 2: checkVal=Math.floor(checkVal/2); break;
    case 3: checkVal=Math.floor(checkVal/5); break;
    case 4: checkVal=1; break;
  }

  let successRank = d100<=checkVal ? 1 : -1;
  if([0,1,2].includes(cocRule) && d100===1) successRank=4;
  if(d100===100 && cocRule===0) successRank=-2;
  if(cocRule===3){ if(d100<=1) successRank=4; if(d100>=100) successRank=-2; }
  return { successRank, criticalSuccessValue: 1 };
}

export function successRankToKey(rank){
  switch(rank){
    case -2: return "判定_大失败";
    case -1: return "判定_失败";
    case 1: return "判定_成功_普通";
    case 2: return "判定_成功_困难";
    case 3: return "判定_成功_极难";
    case 4: return "判定_大成功";
    default: return "判定_失败";
  }
}
