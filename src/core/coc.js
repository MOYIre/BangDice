// COC7 规则检定函数
// 支持多种房规和完整的成功等级判断

import { rollExpr } from './dice.js';

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

// 疯狂症状表 (恐惧和躁狂共用)
// 官方COC7规则中的症状表
const INSANITY_SYMPTOMS = [
  "失忆", "假性残疾", "暴力倾向", "偏执", "人际依赖",
  "昏厥", "逃避行为", "歇斯底里", "恐惧症", "躁狂症"
];

// 详细症状描述 (恐惧症)
const PHOBIA_SYMPTOMS = {
  1: "跌倒/不能移动", 2: "逃跑", 3: "躲藏", 4: "惊叫", 5: "哭泣",
  6: "祈祷", 7: "呻吟", 8: "颤抖", 9: "流汗", 10: "恶心",
  11: "呕吐", 12: "头痛", 13: "晕眩", 14: "目眩", 15: "耳鸣",
  16: "麻痹", 17: "发痒", 18: "刺痛", 19: "发烧", 20: "发冷",
  21: "虚弱", 22: "疲劳", 23: "饥饿", 24: "口渴", 25: "口吃",
  26: "结巴", 27: "失声", 28: "失忆", 29: "健忘", 30: "混乱",
  31: "困惑", 32: "迷失", 33: "迷路", 34: "恐慌", 35: "惊慌",
  36: "惊恐", 37: "惊骇", 38: "惊愕", 39: "惊呆", 40: "震惊",
  41: "惊诧", 42: "惊异", 43: "战栗", 44: "惊悸", 45: "惊怖",
  46: "畏惧", 47: "恐惧", 48: "害怕", 49: "担忧", 50: "忧虑",
  51: "焦虑", 52: "紧张", 53: "不安", 54: "烦躁", 55: "愤怒",
  56: "狂怒", 57: "暴怒", 58: "愤慨", 59: "怨恨", 60: "仇恨",
  61: "敌意", 62: "恶意", 63: "凶恶", 64: "残暴", 65: "野蛮",
  66: "暴力", 67: "攻击性", 68: "殴打冲动", 69: "踢打冲动", 70: "推挤冲动",
  71: "冲撞冲动", 72: "撕咬冲动", 73: "抓挠冲动", 74: "自我伤害", 75: "破坏欲",
  76: "纵火倾向", 77: "偷窃倾向", 78: "说谎倾向", 79: "欺骗倾向", 80: "背叛倾向",
  81: "孤独", 82: "自闭", 83: "抑郁", 84: "绝望", 85: "自杀倾向",
  86: "幻觉", 87: "幻听", 88: "幻视", 89: "妄想", 90: "偏执狂",
  91: "精神分裂", 92: "人格分裂", 93: "强迫症", 94: "洁癖", 95: "厌食症",
  96: "暴食症", 97: "嗜睡", 98: "失眠", 99: "梦魇", 100: "睡眠瘫痪"
};

// 详细症状描述 (躁狂症) - 与恐惧症略有不同
const MANIA_SYMPTOMS = {
  1: "狂喜", 2: "过度活跃", 3: "喋喋不休", 4: "思维奔逸", 5: "自大",
  6: "冲动行为", 7: "冒险倾向", 8: "过度自信", 9: "睡眠减少", 10: "注意力分散",
  11: "易怒", 12: "躁动不安", 13: "过度消费", 14: "性行为不检点", 15: "快速说话",
  16: "思维跳跃", 17: "计划过多", 18: "目标不切实际", 19: "社交过度", 20: "过度热情",
  21: "夸张表达", 22: "戏剧性行为", 23: "情绪波动", 24: "易激动", 25: "创造力爆发",
  26: "艺术狂热", 27: "宗教狂热", 28: "政治狂热", 29: "痴迷某事", 30: "收集癖",
  31: "强迫行为", 32: "仪式性动作", 33: "反复检查", 34: "计数强迫", 35: "整理强迫",
  36: "清洁强迫", 37: "对称强迫", 38: "囤积行为", 39: "拔毛癖", 40: "抠皮癖",
  41: "咬指甲", 42: "咬嘴唇", 43: "磨牙", 44: "摇头", 45: "抖腿",
  46: "打响指", 47: "吹口哨", 48: "哼唱", 49: "唱歌", 50: "跳舞",
  51: "大笑不止", 52: "哭泣不止", 53: "愤怒爆发", 54: "突然恐惧", 55: "突然悲伤",
  56: "突然快乐", 57: "情绪失控", 58: "表情怪异", 59: "姿势怪异", 60: "动作怪异",
  61: "语言怪异", 62: "书写怪异", 63: "绘画怪异", 64: "声音怪异", 65: "衣着怪异",
  66: "饮食怪异", 67: "睡眠怪异", 68: "社交怪异", 69: "性怪异", 70: "行为怪异",
  71: "妄想", 72: "幻觉", 73: "幻听", 74: "幻视", 75: "幻嗅",
  76: "幻味", 77: "幻触", 78: "人格解体", 79: "现实解体", 80: "时间扭曲",
  81: "空间扭曲", 82: "身份混淆", 83: "记忆混淆", 84: "认知扭曲", 85: "判断力下降",
  86: "洞察力丧失", 87: "自知力丧失", 88: "社交判断力丧失", 89: "风险评估能力丧失", 90: "后果考虑不足",
  91: "冲动控制障碍", 92: "情绪调节障碍", 93: "行为抑制障碍", 94: "注意力障碍", 95: "记忆障碍",
  96: "语言障碍", 97: "运动障碍", 98: "感知障碍", 99: "思维障碍", 100: "意识障碍"
};

// 导出兼容旧接口
export const fearList = PHOBIA_SYMPTOMS;
export const maniaList = MANIA_SYMPTOMS;

// 随机抽取疯狂症状
export function getRandomFearSymptom() {
  const roll = Math.floor(Math.random() * 100) + 1;
  return {
    roll: roll,
    symptom: PHOBIA_SYMPTOMS[roll] || "未知症状"
  };
}

export function getRandomManiaSymptom() {
  const roll = Math.floor(Math.random() * 100) + 1;
  return {
    roll: roll,
    symptom: MANIA_SYMPTOMS[roll] || "未知症状"
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
  
  try {
    if (result.successRank > 0) {
      // 成功，使用成功时的SAN损失
      loss = parseDiceValue(successLoss);
    } else {
      // 失败，使用失败时的SAN损失
      loss = parseDiceValue(failLoss);
    }
  } catch (err) {
    // 如果骰子解析失败，使用默认值
    loss = 1;
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

// 解析骰子表达式或数字
function parseDiceValue(expr) {
  if (typeof expr === 'number') return expr;
  
  expr = expr.toString().trim();
  
  // 如果是纯数字
  if (/^\d+$/.test(expr)) {
    return parseInt(expr);
  }
  
  // 尝试使用 rollExpr 解析骰子表达式
  try {
    return rollExpr(expr);
  } catch (err) {
    // 如果失败，尝试简单解析
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
    return 0;
  }
}
