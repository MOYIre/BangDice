// COC7 规则检定函数
// 支持多种房规和完整的成功等级判断

export function resultCheck(cocRule, d100, attrValue, difficulty=1, options={}) {
  const bonus = options.skillBonus || 0;
  let checkVal = attrValue + bonus;
  
  // 根据难度调整判定值
  switch(difficulty) {
    case 2: // 困难
      checkVal = Math.floor(checkVal / 2);
      break;
    case 3: // 极难
      checkVal = Math.floor(checkVal / 5);
      break;
    case 4: // 大成功
      checkVal = 1; // 只要骰出1就是大成功
      break;
    default:
      // 普通难度，不调整判定值
  }

  // 初始化成功等级和关键成功值
  let successRank = d100 <= checkVal ? 1 : -1;
  let criticalSuccessValue = 1; // 大成功阈值
  let fumbleValue = 100;        // 大失败阈值

  // 分支规则设定
  switch (cocRule) {
    case 0:
      // 规则书规则
      // 不满50出96-100大失败，满50出100大失败
      if (checkVal < 50) {
        fumbleValue = 96;
      }
      break;
    case 1:
      // 不满50出1大成功，满50出1-5大成功
      // 不满50出96-100大失败，满50出100大失败
      if (attrValue >= 50) {
        criticalSuccessValue = 5;
      }
      if (attrValue < 50) {
        fumbleValue = 96;
      }
      break;
    case 2:
      // 出1-5且<=成功率大成功
      // 出100或出96-99且>成功率大失败
      criticalSuccessValue = 5;
      if (attrValue < criticalSuccessValue) {
        criticalSuccessValue = attrValue;
      }
      fumbleValue = 96;
      if (attrValue >= fumbleValue) {
        fumbleValue = attrValue + 1;
        if (fumbleValue > 100) {
          fumbleValue = 100;
        }
      }
      break;
    case 3:
      // 出1-5大成功
      // 出100或出96-99大失败
      criticalSuccessValue = 5;
      fumbleValue = 96;
      break;
    case 4:
      // 出1-5且<=成功率/10大成功
      // 不满50出>=96+成功率/10大失败，满50出100大失败
      criticalSuccessValue = Math.floor(attrValue / 10);
      if (criticalSuccessValue > 5) {
        criticalSuccessValue = 5;
      }
      fumbleValue = 96 + Math.floor(attrValue / 10);
      if (100 < fumbleValue) {
        fumbleValue = 100;
      }
      break;
    case 5:
      // 出1-2且<成功率/5大成功
      // 不满50出96-100大失败，满50出99-100大失败
      criticalSuccessValue = Math.floor(attrValue / 5);
      if (criticalSuccessValue > 2) {
        criticalSuccessValue = 2;
      }
      if (attrValue < 50) {
        fumbleValue = 96;
      } else {
        fumbleValue = 99;
      }
      break;
    case 11: // dg
      criticalSuccessValue = 1;
      fumbleValue = 100;
      break;
  }

  // 成功判定
  if (successRank === 1 || d100 <= criticalSuccessValue) {
    // 区分大成功、困难成功、极难成功等
    if (d100 <= attrValue/2) {
      successRank = 2; // 困难成功
    }
    if (d100 <= Math.floor(attrValue/5)) {
      successRank = 3; // 极难成功
    }
    if (d100 <= criticalSuccessValue) {
      successRank = 4; // 大成功
    }
  } else if (d100 >= fumbleValue) {
    successRank = -2; // 大失败
  }

  // 默认规则改判，为 1 必是大成功，即使判定线是0
  if ((cocRule === 0 || cocRule === 1 || cocRule === 2) && d100 === 1) {
    successRank = 4;
  }

  // 默认规则改判，100必然是大失败
  if (d100 === 100 && cocRule === 0) {
    successRank = -2;
  }

  // 规则3的改判，强行大成功或大失败
  if (cocRule === 3) {
    if (d100 <= criticalSuccessValue) {
      successRank = 4; // 大成功
    }
    if (d100 >= fumbleValue) {
      successRank = -2; // 大失败
    }
  }

  // 规则DG改判，检定成功基础上，个位十位相同大成功
  // 检定失败基础上，个位十位相同大失败
  if (cocRule === 11) {
    const numUnits = d100 % 10;
    const numTens = Math.floor(d100 % 100 / 10);
    const dgCheck = numUnits === numTens;

    if (successRank > 0) {
      if (dgCheck) {
        successRank = 4; // 大成功
      } else {
        successRank = 1; // 抹除困难极难成功
      }
    } else {
      if (dgCheck) {
        successRank = -2; // 大失败
      } else {
        successRank = -1; // 失败
      }
    }

    // 23.3 根据dg规则书修正: 为1大成功
    if (d100 === 1) {
      successRank = 4;
    }
  }

  return { successRank, criticalSuccessValue };
}

// 根据规则和难度返回成功等级文本
export function successRankToKey(rank) {
  switch (rank) {
    case 4: return "判定_大成功";
    case 3: return "判定_成功_极难";
    case 2: return "判定_成功_困难";
    case 1: return "判定_成功_普通";
    case -1: return "判定_失败";
    case -2: return "判定_大失败";
    default: return "判定_失败";
  }
}

// COC7 房规设置
export const COC_RULES = {
  0: { name: "规则书", desc: "不满50出96-100大失败，满50出100大失败" },
  1: { name: "房规1", desc: "不满50出1大成功，满50出1-5大成功；不满50出96-100大失败，满50出100大失败" },
  2: { name: "房规2", desc: "出1-5且<=成功率大成功；出100或出96-99且>成功率大失败" },
  3: { name: "房规3", desc: "出1-5大成功；出100或出96-99大失败" },
  4: { name: "房规4", desc: "出1-5且<=成功率/10大成功；不满50出>=96+成功率/10大失败，满50出100大失败" },
  5: { name: "房规5", desc: "出1-2且<成功率/5大成功；不满50出96-100大失败，满50出99-100大失败" },
  11: { name: "Delta Green", desc: "DG规则：个位十位相同大成功/大失败" }
};

// 获取指定规则的描述
export function getRuleDesc(ruleIndex) {
  return COC_RULES[ruleIndex] || COC_RULES[0];
}

// 检查是否为成功
export function isSuccess(successRank) {
  return successRank >= 1;
}

// 检查是否为困难成功或以上
export function isHardSuccess(successRank) {
  return successRank >= 2;
}

// 检查是否为极难成功或以上
export function isExtremeSuccess(successRank) {
  return successRank >= 3;
}

// 检查是否为大成功
export function isCriticalSuccess(successRank) {
  return successRank === 4;
}

// 检查是否为大失败
export function isFumble(successRank) {
  return successRank <= -2;
}

// 计算伤害加值(DB)
export function calculateDamageBonus(str, siz) {
  const sum = str + siz;
  if (sum < 65) return -2;
  if (sum < 85) return -1;
  if (sum < 125) return 0;
  if (sum < 165) return "1d4";
  if (sum < 205) return "1d6";
  
  // 超过205的计算
  const additional = Math.floor((sum - 205) / 80) + 2;
  return `${additional}d6`;
}

// 计算体格
export function calculateBuild(str, siz) {
  const sum = str + siz;
  if (sum < 65) return -2;
  if (sum < 85) return -1;
  if (sum < 125) return 0;
  if (sum < 165) return 1;
  if (sum < 205) return 2;
  
  // 超过205的计算
  return Math.floor((sum - 205) / 80) + 3;
}

// 计算生命值上限
export function calculateHP(con, siz) {
  return Math.floor((con + siz) / 10);
}

// 计算魔法值上限
export function calculateMP(pow) {
  return Math.floor(pow / 5);
}

// 计算灵感点数
export function calculateIdea(int) {
  return Math.floor(int / 5);
}

// 计算幸运点数
export function calculateLuck(pow) {
  return Math.floor(pow / 5);
}

// 恐惧症状表
export const fearList = {
  1: "跌倒/不能移动",
  2: "逃跑",
  3: "躲藏",
  4: "惊叫",
  5: "哭泣",
  6: "祈祷",
  7: "呻吟",
  8: "颤抖",
  9: "流汗",
  10: "恶心",
  11: "呕吐",
  12: "头痛",
  13: "晕眩",
  14: "目眩",
  15: "耳鸣",
  16: "麻痹",
  17: "发痒",
  18: "刺痛",
  19: "发烧",
  20: "发冷",
  21: "虚弱",
  22: "疲劳",
  23: "饥饿",
  24: "口渴",
  25: "口吃",
  26: "结巴",
  27: "失声",
  28: "失忆",
  29: "健忘",
  30: "混乱",
  31: "困惑",
  32: "迷失",
  33: "迷路",
  34: "恐慌",
  35: "惊慌",
  36: "惊恐",
  37: "惊骇",
  38: "惊愕",
  39: "惊呆",
  40: "震惊",
  41: "惊诧",
  42: "惊异",
  43: "惊愕",
  44: "惊悸",
  45: "惊怖",
  46: "惊骇",
  47: "惊悸",
  48: "惊怯",
  49: "惊惧",
  50: "畏惧",
  51: "恐惧",
  52: "害怕",
  53: "担忧",
  54: "忧虑",
  55: "焦虑",
  56: "紧张",
  57: "不安",
  58: "烦躁",
  59: "愤怒",
  60: "狂怒",
  61: "暴怒",
  62: "愤慨",
  63: "怨恨",
  64: "仇恨",
  65: "敌意",
  66: "恶意",
  67: "凶恶",
  68: "残暴",
  69: "野蛮",
  70: "暴力",
  71: "攻击",
  72: "殴打",
  73: "踢打",
  74: "推挤",
  75: "冲撞",
  76: "撞击",
  77: "冲撞",
  78: "撞击",
  79: "扑击",
  80: "撕咬",
  81: "抓挠",
  82: "抓伤",
  83: "咬伤",
  84: "刺伤",
  85: "割伤",
  86: "砍伤",
  87: "打伤",
  88: "撞伤",
  89: "跌伤",
  90: "摔伤",
  91: "扭伤",
  92: "拉伤",
  93: "挫伤",
  94: "挫伤",
  95: "重伤",
  96: "重创",
  97: "致命",
  98: "濒死",
  99: "死亡",
  100: "毁灭"
};

// 躁狂症状表
export const maniaList = {
  1: "跌倒/不能移动",
  2: "逃跑",
  3: "躲藏",
  4: "惊叫",
  5: "哭泣",
  6: "祈祷",
  7: "呻吟",
  8: "颤抖",
  9: "流汗",
  10: "恶心",
  11: "呕吐",
  12: "头痛",
  13: "晕眩",
  14: "目眩",
  15: "耳鸣",
  16: "麻痹",
  17: "发痒",
  18: "刺痛",
  19: "发烧",
  20: "发冷",
  21: "虚弱",
  22: "疲劳",
  23: "饥饿",
  24: "口渴",
  25: "口吃",
  26: "结巴",
  27: "失声",
  28: "失忆",
  29: "健忘",
  30: "混乱",
  31: "困惑",
  32: "迷失",
  33: "迷路",
  34: "恐慌",
  35: "惊慌",
  36: "惊恐",
  37: "惊骇",
  38: "惊愕",
  39: "惊呆",
  40: "震惊",
  41: "惊诧",
  42: "惊异",
  43: "惊愕",
  44: "惊悸",
  45: "惊怖",
  46: "惊骇",
  47: "惊悸",
  48: "惊怯",
  49: "惊惧",
  50: "畏惧",
  51: "恐惧",
  52: "害怕",
  53: "担忧",
  54: "忧虑",
  55: "焦虑",
  56: "紧张",
  57: "不安",
  58: "烦躁",
  59: "愤怒",
  60: "狂怒",
  61: "暴怒",
  62: "愤慨",
  63: "怨恨",
  64: "仇恨",
  65: "敌意",
  66: "恶意",
  67: "凶恶",
  68: "残暴",
  69: "野蛮",
  70: "暴力",
  71: "攻击",
  72: "殴打",
  73: "踢打",
  74: "推挤",
  75: "冲撞",
  76: "撞击",
  77: "冲撞",
  78: "撞击",
  79: "扑击",
  80: "撕咬",
  81: "抓挠",
  82: "抓伤",
  83: "咬伤",
  84: "刺伤",
  85: "割伤",
  86: "砍伤",
  87: "打伤",
  88: "撞伤",
  89: "跌伤",
  90: "摔伤",
  91: "扭伤",
  92: "拉伤",
  93: "挫伤",
  94: "挫伤",
  95: "重伤",
  96: "重创",
  97: "致命",
  98: "濒死",
  99: "死亡",
  100: "毁灭"
};

// 随機抽取瘋狂症狀
export function getRandomFearSymptom() {
  const roll = Math.floor(Math.random() * 100) + 1;
  return {
    roll: roll,
    symptom: fearList[roll] || "未知症状"
  };
}

export function getRandomManiaSymptom() {
  const roll = Math.floor(Math.random() * 100) + 1;
  return {
    roll: roll,
    symptom: maniaList[roll] || "未知症状"
  };
}

// 生成COC7人物卡
export function generateCOCCharacter(count = 1) {
  const chineseNums = ["壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖", "拾"];
  const results = [];

  for (let i = 0; i < count; i++) {
    // 生成属性 (3d6*5 或 (2d6+6)*5)
    const strength = roll3d6() * 5;      // 力量
    const dexterity = roll3d6() * 5;     // 敏捷
    const power = roll3d6() * 5;         // 意志
    const constitution = roll3d6() * 5;  // 体质
    const appearance = roll3d6() * 5;    // 外貌
    const education = (roll2d6() + 6) * 5; // 教育
    const size = (roll2d6() + 6) * 5;    // 体型
    const intelligence = (roll2d6() + 6) * 5; // 智力
    const luck = roll3d6() * 5;          // 幸运

    // 计算HP和DB
    const hp = Math.floor((constitution + size) / 10);
    const sumPow = strength + size;
    let db = "-2";
    if (sumPow >= 65 && sumPow < 85) {
      db = "-1";
    } else if (sumPow >= 85 && sumPow < 125) {
      db = "0";
    } else if (sumPow >= 125 && sumPow < 165) {
      db = "1d4";
    } else if (sumPow >= 165 && sumPow < 205) {
      db = "1d6";
    } else if (sumPow >= 205) {
      const additional = Math.floor((sumPow - 205) / 80) + 2;
      db = `${additional}d6`;
    }

    // 自动生成称号
    const titles = [];
    if (strength > 70 && size > 70) {
      titles.push("巨力之躯");
    } else if (strength > 60) {
      titles.push("力能扛鼎");
    }
    if (dexterity > 70 && appearance > 65) {
      titles.push("灵光掠影");
    } else if (dexterity > 60) {
      titles.push("矫健之姿");
    }
    if (intelligence > 70 && education > 70) {
      titles.push("博学贤者");
    } else if (intelligence > 60) {
      titles.push("思维敏捷");
    }
    if (power > 70 && constitution > 65) {
      titles.push("钢铁意志");
    } else if (power > 60) {
      titles.push("坚定之心");
    }
    if (luck > 70) {
      titles.push("命运的宠儿");
    }
    
    if (titles.length === 0) {
      titles.push("平凡旅者");
    }
    if (titles.length > 2) {
      titles.splice(2); // 只保留前两个
    }

    // 计算总分
    const total = strength + dexterity + power + constitution + appearance + education + size + intelligence + luck;
    
    // 计算星级 (简化版)
    const expected = 510; // 期望值
    const sigma = 40;
    const z = (total - expected) / sigma;
    let starsCount = Math.round(5 + z * 3.5);
    if (starsCount < 1) starsCount = 1;
    if (starsCount > 10) starsCount = 10;
    const stars = "★".repeat(starsCount) + "☆".repeat(10 - starsCount);

    results.push({
      id: chineseNums[i % chineseNums.length],
      title: titles.join("・"),
      stars: stars,
      strength,
      dexterity,
      power,
      constitution,
      appearance,
      education,
      size,
      intelligence,
      luck,
      hp,
      db,
      total,
      percentage: 0 // 简化处理，不计算超越百分比
    });
  }

  return results;
}

// 骰3d6
function roll3d6() {
  return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
}

// 骰2d6
function roll2d6() {
  return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
}

// 理智检定函数
export function sanityCheck(sanValue, successLoss, failLoss, d100 = null) {
  if (d100 === null) {
    d100 = Math.floor(Math.random() * 100) + 1;
  }
  
  const result = resultCheck(0, d100, sanValue, 1, {});
  let loss = 0;
  
  if (result.successRank > 0) {
    // 成功，使用成功时的SAN损失
    loss = parseDiceExpression(successLoss);
  } else {
    // 失败，使用失败时的SAN损失
    loss = parseDiceExpression(failLoss);
  }
  
  const newSan = Math.max(0, sanValue - loss);
  
  return {
    d100,
    success: result.successRank > 0,
    successRank: result.successRank,
    originalSan: sanValue,
    sanLoss: loss,
    newSan,
    isCrazy: newSan === 0 || loss >= 5 // 损失>=5点或归零进入疯狂
  };
}

// 解析简单的骰子表达式如"1d6", "2d4+1"等
function parseDiceExpression(expr) {
  expr = expr.toString().toLowerCase().replace(/\s+/g, "");
  
  // 匹配 1d6 或 1d6+2 或 2d4-1 等格式
  const match = expr.match(/^(\d+)[dD](\d+)([+-]\d+)?$/);
  if (match) {
    const count = parseInt(match[1]) || 1;
    const faces = parseInt(match[2]);
    const bonus = match[3] ? parseInt(match[3]) : 0;
    
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += Math.floor(Math.random() * faces) + 1;
    }
    return sum + bonus;
  }
  
  // 如果不是骰子表达式，尝试解析纯数字
  const num = parseInt(expr);
  return isNaN(num) ? 0 : num;
}
