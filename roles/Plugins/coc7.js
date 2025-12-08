import { resultCheck, successRankToKey, calculateDamageBonus, calculateBuild, calculateHP, calculateMP, COC_RULES, getRandomFearSymptom, getRandomManiaSymptom, generateCOCCharacter, sanityCheck } from '../../src/core/coc.js';
import { rollExpr } from '../../src/core/dice.js';
import { renderKey, loadTemplates } from '../../src/utils/templates.js';
import gameLogRecorder from '../../src/core/game-logger.js';
import fs from 'fs';
import path from 'path';

// COC7 规则的完整实现
// 包含属性管理、检定系统、玩家系统等

// 属性别名映射
const attrAliases = {
  // 运气/幸运相关
  '运势': '幸运',
  '运气': '幸运',
  'luck': '幸运',
  'LUCK': '幸运',
  
  // 力量相关
  'str': '力量',
  'STR': '力量',
  
  // 体质相关
  'con': '体质',
  'CON': '体质',
  
  // 体型相关
  'siz': '体型',
  'SIZ': '体型',
  
  // 敏捷相关
  'dex': '敏捷',
  'DEX': '敏捷',
  
  // 外貌相关
  'app': '外貌',
  'APP': '外貌',
  
  // 智力相关
  'int': '智力',
  'INT': '智力',
  
  // 意志相关
  'pow': '意志',
  'POW': '意志',
  
  // 教育相关
  'edu': '教育',
  'EDU': '教育',
  
  // 侦查相关
  '侦察': '侦查',
  '搜索': '侦查',
  'investigation': '侦查',
  'INV': '侦查',
  
  // 闪避相关
  '躲避': '闪避',
  'dodge': '闪避',
  
  // 其他常用别名
  '生命': '生命值',
  'hp': '生命值',
  'HP': '生命值',
  'san': '理智',
  'SAN': '理智',
  '克苏鲁': '克苏鲁神话',
  'cm': '克苏鲁神话'
};

// 存储每个群组/用户的角色属性
const attrDir = path.join(process.cwd(), 'roles');
if (!fs.existsSync(attrDir)) fs.mkdirSync(attrDir, { recursive: true });

const attrFile = path.join(attrDir, 'players.json');
let playerAttrs = {};
if (fs.existsSync(attrFile)) {
  try {
    playerAttrs = JSON.parse(fs.readFileSync(attrFile, 'utf8'));
  } catch (e) {
    console.error('读取玩家属性文件失败:', e.message);
  }
}

// 存储玩家昵称
let playerNames = {};
const nameFile = path.join(attrDir, 'playerNames.json');
if (fs.existsSync(nameFile)) {
  try {
    playerNames = JSON.parse(fs.readFileSync(nameFile, 'utf8'));
  } catch (e) {
    console.error('读取玩家昵称文件失败:', e.message);
  }
}

function savePlayerAttrs() {
  try {
    fs.writeFileSync(attrFile, JSON.stringify(playerAttrs, null, 2), 'utf8');
  } catch (e) {
    console.error('保存玩家属性失败:', e.message);
  }
}

function savePlayerNames() {
  try {
    fs.writeFileSync(nameFile, JSON.stringify(playerNames, null, 2), 'utf8');
  } catch (e) {
    console.error('保存玩家昵称失败:', e.message);
  }
}

// 获取玩家名称（优先使用昵称，否则使用用户ID）
function getPlayerName(groupId, userId) {
  const key = `${groupId}_${userId}`;
  return playerNames[key] || `玩家${userId}`;
}

// 保存玩家属性
function saveAttr(groupId, userId, key, value) {
  const groupKey = groupId.toString();
  const userKey = userId.toString();
  
  if (!playerAttrs[groupKey]) playerAttrs[groupKey] = {};
  if (!playerAttrs[groupKey][userKey]) playerAttrs[groupKey][userKey] = {};
  
  playerAttrs[groupKey][userKey][key] = value;
  savePlayerAttrs();
}

// 获取玩家属性
function getAttr(groupId, userId, key) {
  const groupKey = groupId.toString();
  const userKey = userId.toString();
  
  if (!playerAttrs[groupKey] || !playerAttrs[groupKey][userKey]) return null;
  
  // 首先尝试直接查找属性
  let value = playerAttrs[groupKey][userKey][key];
  if (value !== undefined) {
    return value;
  }
  
  // 如果直接查找失败，尝试通过别名查找
  const normalizedKey = key.toLowerCase();
  for (const [alias, original] of Object.entries(attrAliases)) {
    if (alias.toLowerCase() === normalizedKey) {
      // 查找原始属性名
      const originalValue = playerAttrs[groupKey][userKey][original];
      if (originalValue !== undefined) {
        return originalValue;
      }
      // 也尝试别名作为原始属性名的情况
      const aliasAsKey = playerAttrs[groupKey][userKey][alias];
      if (aliasAsKey !== undefined) {
        return aliasAsKey;
      }
    }
  }
  
  // 最后尝试将输入的key作为别名来查找对应的原始属性
  const originalAttr = attrAliases[key];
  if (originalAttr) {
    const originalValue = playerAttrs[groupKey][userKey][originalAttr];
    if (originalValue !== undefined) {
      return originalValue;
    }
  }
  
  return null;
}

// 获取玩家所有属性
function getAllAttrs(groupId, userId) {
  const groupKey = groupId.toString();
  const userKey = userId.toString();
  
  if (!playerAttrs[groupKey] || !playerAttrs[groupKey][userKey]) return {};
  return { ...playerAttrs[groupKey][userKey] }; // 返回副本
}

// 解析属性字符串
function parseAttrs(text) {
  const attrs = {};
  
  // 定义常见的COC7属性名称，用于辅助解析
  const commonAttrs = [
    '力量', 'str', 'STR', '体质', 'con', 'CON', '体型', 'siz', 'SIZ',
    '敏捷', 'dex', 'DEX', '外貌', 'app', 'APP', '智力', 'int', 'INT',
    '意志', 'pow', 'POW', '教育', 'edu', 'EDU', '生命值', 'HP', 'hp',
    '理智', 'san', 'SAN', '魔法值', 'MP', 'mp', '克苏鲁神话', 'cm', 'CM',
    '幸运', '运气', '运势', 'luck', 'LUCK', '灵感', 'idea', 'IDEA',
    '知识', '会计', '人类学', '估价', '考古学', '取悦', '魅惑', '攀爬',
    '计算机', '计算机使用', '电脑', '信用', '信誉', '信用评级', '克苏鲁',
    '乔装', '闪避', '汽车', '驾驶', '汽车驾驶', '电气维修', '电子学',
    '话术', '斗殴', '手枪', '急救', '历史', '恐吓', '跳跃', '母语',
    '法律', '图书馆', '图书馆使用', '聆听', '开锁', '撬锁', '锁匠',
    '机械维修', '医学', '博物学', '自然学', '领航', '导航', '神秘学',
    '重型操作', '重型机械', '操作重型机械', '重型', '说服', '精神分析',
    '心理学', '骑术', '妙手', '侦查', '潜行', '生存', '游泳', '投掷',
    '追踪', '驯兽', '潜水', '爆破', '读唇', '催眠', '炮术'
  ];
  
  // 按长度降序排序，优先匹配较长的属性名
  const sortedAttrs = [...commonAttrs].sort((a, b) => b.length - a.length);
  
  // 创建一个已处理位置的记录，避免重复匹配
  const processedPositions = new Array(text.length).fill(false);
  
  // 遍历每个常见属性名，查找在文本中的所有位置
  for (const attrName of sortedAttrs) {
    let pos = 0;
    while ((pos = text.indexOf(attrName, pos)) !== -1) {
      // 检查这个位置是否已经被处理过
      let isOverlapping = false;
      for (let i = pos; i < pos + attrName.length; i++) {
        if (processedPositions[i]) {
          isOverlapping = true;
          break;
        }
      }
      
      if (!isOverlapping) {
        // 标记这个属性名的位置为已处理
        for (let i = pos; i < pos + attrName.length; i++) {
          processedPositions[i] = true;
        }
        
        // 在属性名后面查找数字
        let numStart = pos + attrName.length;
        while (numStart < text.length && /\s/.test(text[numStart])) {
          numStart++; // 跳过空格
        }
        
        if (numStart < text.length && /\d/.test(text[numStart])) {
          let numEnd = numStart;
          while (numEnd < text.length && /[\d.]/.test(text[numEnd])) {
            numEnd++;
          }
          
          if (numEnd > numStart) {
            const numValue = parseFloat(text.substring(numStart, numEnd));
            if (!isNaN(numValue)) {
              attrs[attrName] = numValue;
              
              // 标记数字部分也为已处理
              for (let i = numStart; i < numEnd; i++) {
                processedPositions[i] = true;
              }
            }
          }
        }
      }
      
      pos += attrName.length; // 移动到下一个可能的位置
    }
  }
  
  return attrs;
}

// 计算衍生属性
function calculateDerivedAttrs(attrs) {
  const result = { ...attrs };
  
  // 计算db (伤害加值)
  const str = attrs.力量 || attrs.str || attrs.STR || 0;
  const siz = attrs.体型 || attrs.siz || attrs.SIZ || 0;
  const strSizSum = str + siz;
  
  if (strSizSum < 65) {
    result.db = -2;
    result.DB = -2;
    result.体格 = -2;
    result.體格 = -2;
  } else if (strSizSum < 85) {
    result.db = -1;
    result.DB = -1;
    result.体格 = -1;
    result.體格 = -1;
  } else if (strSizSum < 125) {
    result.db = 0;
    result.DB = 0;
    result.体格 = 0;
    result.體格 = 0;
  } else if (strSizSum < 165) {
    result.db = '1d4';
    result.DB = '1d4';
    result.体格 = 1;
    result.體格 = 1;
  } else if (strSizSum < 205) {
    result.db = '1d6';
    result.DB = '1d6';
    result.体格 = 2;
    result.體格 = 2;
  } else {
    const additional = Math.floor((strSizSum - 205) / 80) + 2;
    result.db = `${additional}d6`;
    result.DB = `${additional}d6`;
    result.体格 = additional + 2;
    result.體格 = additional + 2;
  }
  
  // 生命值上限
  const con = attrs.体质 || attrs.con || attrs.CON || 0;
  const sizValue = attrs.体型 || attrs.siz || attrs.SIZ || 0;
  result.生命值上限 = Math.floor((con + sizValue) / 10);
  result.HPMax = Math.floor((con + sizValue) / 10);
  if (result.生命值 === undefined || result.生命值 === null) {
    result.生命值 = result.生命值上限; // 默认满血
    result.HP = result.HPMax;
  }
  
  // 魔法值上限
  const pow = attrs.意志 || attrs.pow || attrs.POW || 0;
  result.魔法值上限 = Math.floor(pow / 5);
  result.MPMax = Math.floor(pow / 5);
  if (result.魔法值 === undefined || result.魔法值 === null) {
    result.魔法值 = result.魔法值上限; // 默认满魔
    result.MP = result.MPMax;
  }
  
  // 理智值
  if (result.理智 === undefined || result.理智 === null) {
    result.理智 = attrs.意志 || attrs.pow || attrs.POW || 0;
    result.SAN = result.理智;
  }
  
  // 闪避
  const dex = attrs.敏捷 || attrs.dex || attrs.DEX || 0;
  result.闪避 = Math.floor(dex / 2);
  result.閃避 = result.闪避;
  
  return result;
}

// st命令：设置属性
function stCommand(ctx, e, argv) {
  const groupId = e.group_id;
  const userId = e.user_id;
  const attrsText = argv.args.join('');
  
  if (!attrsText) {
    // 如果没有参数，显示当前属性
    return stshowCommand(ctx, e, argv);
  }
  
  const attrs = parseAttrs(attrsText);
  if (Object.keys(attrs).length === 0) {
    ctx.send('未识别到有效属性格式');
    return;
  }
  
  // 保存属性
  for (const [key, value] of Object.entries(attrs)) {
    saveAttr(groupId, userId, key, value);
  }
  
  // 重新计算衍生属性
  const allAttrs = getAllAttrs(groupId, userId);
  const calculatedAttrs = calculateDerivedAttrs(allAttrs);
  
  // 保存所有属性（包括计算出的）
  for (const [key, value] of Object.entries(calculatedAttrs)) {
    saveAttr(groupId, userId, key, value);
  }
  
  const attrList = Object.entries(attrs).map(([k, v]) => `${k}${v}`).join(' ');
  const playerName = getPlayerName(groupId, userId);
  
  // 记录日志
  gameLogRecorder.recordEvent(groupId, 'default', {
    type: 'attribute_set',
    userId: userId,
    message: `${playerName} 设置属性: ${attrList}`
  });
  
  ctx.send(`${playerName} 的属性已设置: ${attrList}`);
}

// stshow命令：显示属性
function stshowCommand(ctx, e, argv) {
  const groupId = e.group_id;
  const userId = e.user_id;
  const allAttrs = getAllAttrs(groupId, userId);
  
  if (Object.keys(allAttrs).length === 0) {
    ctx.send('未发现当前角色的属性记录，如同空白的五线谱等待填满。');
    return;
  }
  
  // 按类别整理属性
  const mainAttrs = ['力量', 'str', 'STR', '体质', 'con', 'CON', '体型', 'siz', 'SIZ', 
                    '敏捷', 'dex', 'DEX', '外貌', 'app', 'APP', '智力', 'int', 'INT', 
                    '意志', 'pow', 'POW', '教育', 'edu', 'EDU'];
  const combatAttrs = ['生命值', 'HP', '理智', 'san', 'SAN', '克苏鲁神话', 'cm', '闪避', '躲避'];
  const skillAttrs = [];
  
  for (const [key, value] of Object.entries(allAttrs)) {
    if (!mainAttrs.includes(key) && !combatAttrs.includes(key) && 
        !['生命值上限', 'HPMax', '魔法值上限', 'MPMax', 'db', 'DB', '体格', '體格', '魔法值', 'MP'].includes(key)) {
      skillAttrs.push([key, value]);
    }
  }
  
  const playerName = getPlayerName(groupId, userId);
  let response = `${playerName} 的属性:\n`;
  
  // 显示主要属性
  const mainAttrList = mainAttrs
    .filter(attr => allAttrs[attr] !== undefined)
    .map(attr => `${attr}:${allAttrs[attr]}`)
    .join(' ');
  if (mainAttrList) response += `【基础属性】${mainAttrList}\n`;
  
  // 显示战斗相关属性
  const combatAttrList = combatAttrs
    .filter(attr => allAttrs[attr] !== undefined)
    .map(attr => {
      if ((attr === '生命值' || attr === 'HP') && allAttrs['生命值上限'] !== undefined) {
        return `${attr}:${allAttrs[attr]}/${allAttrs['生命值上限']}`;
      } else if ((attr === '生命值' || attr === 'HP') && allAttrs['HPMax'] !== undefined) {
        return `${attr}:${allAttrs[attr]}/${allAttrs['HPMax']}`;
      }
      return `${attr}:${allAttrs[attr]}`;
    })
    .join(' ');
  if (combatAttrList) response += `【战斗相关】${combatAttrList}\n`;
  
  // 显示衍生属性
  const derivedAttrs = ['db', 'DB', '体格', '體格', '生命值上限', 'HPMax', '魔法值上限', 'MPMax', '魔法值', 'MP'];
  const derivedAttrList = derivedAttrs
    .filter(attr => allAttrs[attr] !== undefined)
    .map(attr => {
      if ((attr === '生命值上限' || attr === 'HPMax') && (allAttrs['生命值'] !== undefined || allAttrs['HP'] !== undefined)) return ''; // 已在战斗属性中显示
      if ((attr === '魔法值' || attr === 'MP') && (allAttrs['魔法值上限'] !== undefined || allAttrs['MPMax'] !== undefined)) {
        const maxAttr = allAttrs['魔法值上限'] !== undefined ? '魔法值上限' : 'MPMax';
        return `${attr}:${allAttrs[attr]}/${allAttrs[maxAttr]}`;
      }
      return `${attr}:${allAttrs[attr]}`;
    })
    .filter(attr => attr !== '')
    .join(' ');
  if (derivedAttrList) response += `【衍生属性】${derivedAttrList}\n`;
  
  // 显示技能（只显示前10个）
  if (skillAttrs.length > 0) {
    const topSkills = skillAttrs.slice(0, 10);
    const skillList = topSkills.map(([k, v]) => `${k}:${v}`).join(' ');
    response += `【技能】${skillList}`;
    if (skillAttrs.length > 10) {
      response += ` 等${skillAttrs.length}项`;
    }
  }
  
  ctx.send(response.trim());
}

// 辅助函数：获取成功等级文本
function getSuccessText(successRank) {
  switch (successRank) {
    case 4: return '大成功';
    case 3: return '极难成功';
    case 2: return '困难成功';
    case 1: return '成功';
    case -1: return '失败';
    case -2: return '大失败';
    default: return '未知';
  }
}

// ra命令：属性检定
function raCommand(ctx, e, argv) {
  const groupId = e.group_id;
  const userId = e.user_id;
  const params = argv.args.join('');
  
  if (!params) {
    ctx.send('请指定要检定的属性，格式如：.ra 力量 或 .ra 困难侦查');
    return;
  }
  
  // 解析难度：困难、极难、大成功
  let difficulty = 1; // 普通
  let attrName = params.toLowerCase();
  let difficultyText = '';
  
  if (params.toLowerCase().startsWith('困难') || params.toLowerCase().startsWith('困難')) {
    difficulty = 2;
    attrName = params.substring(2).toLowerCase();
    difficultyText = '困难';
  } else if (params.toLowerCase().startsWith('极难') || params.toLowerCase().startsWith('極難')) {
    difficulty = 3;
    attrName = params.substring(2).toLowerCase();
    difficultyText = '极难';
  } else if (params.toLowerCase().startsWith('大成功')) {
    difficulty = 4;
    attrName = params.substring(3).toLowerCase();
    difficultyText = '大成功';
  }
  
  // 检查是否有加值（例如：力量+10）
  let skillBonus = 0;
  const bonusMatch = attrName.match(/([a-zA-Z\u4e00-\u9fa5]+)([+-]\d+)/);
  if (bonusMatch) {
    attrName = bonusMatch[1].toLowerCase();
    skillBonus = parseInt(bonusMatch[2]);
  }
  
  const attrValue = getAttr(groupId, userId, attrName);
  if (attrValue === null) {
    ctx.send(`未找到属性 "${attrName}"，请先使用 .st 设置属性`);
    return;
  }
  
  // 加上技能加值
  const finalValue = Math.max(1, attrValue + skillBonus);
  
  // 1d100
  const d100 = Math.floor(Math.random() * 100) + 1;
  const result = resultCheck(0, d100, finalValue, difficulty, { skillBonus });
  const rankKey = successRankToKey(result.successRank);
  
  // 加载模板
  const templates = loadTemplates();
  
  // 获取玩家名称
  const playerName = getPlayerName(groupId, userId);
  
  // 计算判定值
  let checkValue = finalValue;
  switch (difficulty) {
    case 2: checkValue = Math.floor(finalValue / 2); break;
    case 3: checkValue = Math.floor(finalValue / 5); break;
    case 4: checkValue = 1; break;
  }
  
  // 定义成功文本
  let successText = '';
  switch(result.successRank) {
    case -2: successText = '大失败'; break;
    case -1: successText = '失败'; break;
    case 1: successText = '成功'; break;
    case 2: successText = '困难成功'; break;
    case 3: successText = '极难成功'; break;
    case 4: successText = '大成功'; break;
    default: successText = '未知';
  }
  
  // 构建上下文
  const ctxData = {
    't玩家': playerName,
    't属性': attrName,
    'tD100': d100,
    't判定值': checkValue,
    'tSuccessRank': result.successRank,
    't判定结果': successText,
    playerName: playerName,
    attrName: attrName,
    attrValue: finalValue,
    rollValue: d100,
    difficulty: difficulty === 1 ? '普通' : difficulty === 2 ? '困难' : difficulty === 3 ? '极难' : '大成功',
    checkValue: checkValue,
    successRank: result.successRank
  };
  
  // 生成结果消息
  let resultText = renderKey(templates, rankKey, ctxData);
  if (!resultText || resultText === rankKey) {
    // 如果模板未找到，使用您要求的格式
    resultText = `<${playerName}>的"${difficultyText}${attrName}"检定结果为: D100=${d100}/${checkValue} ${successText}！`;
  }
  
  // 记录日志
  gameLogRecorder.recordEvent(groupId, 'default', {
    type: 'check',
    userId: userId,
    message: `${playerName} 进行${difficultyText}${attrName}检定: ${d100}/${checkValue} (${successText})`,
    data: {
      attr: attrName,
      value: finalValue,
      roll: d100,
      checkValue: checkValue,
      success: successText
    }
  });
  
  ctx.send(resultText);
}

// en命令：技能成长
function enCommand(ctx, e, argv) {
  const groupId = e.group_id;
  const userId = e.user_id;
  const skillText = argv.args.join('');
  
  if (!skillText) {
    ctx.send('请指定要成长的技能，格式如：.en 侦查');
    return;
  }
  
  // 解析技能名称和当前值
  const skillMatch = skillText.match(/([a-zA-Z\u4e00-\u9fa5]+)(\d+)?/);
  if (!skillMatch) {
    ctx.send('技能格式错误，请使用如".en 侦查"或".en 侦查60"的格式');
    return;
  }
  
  const skillName = skillMatch[1];
  const currentSkillValue = skillMatch[2] ? parseInt(skillMatch[2]) : getAttr(groupId, userId, skillName);
  
  if (currentSkillValue === null) {
    ctx.send(`未找到技能 "${skillName}"，请先使用 .st 设置`);
    return;
  }
  
  // 骰1d100
  const d100 = Math.floor(Math.random() * 100) + 1;
  let success = false;
  let increment = 0;
  
  // 检查是否成功（如果骰出高于当前值或大于95）
  if (d100 > 95) {
    // 大失败
    success = false;
  } else if (d100 > currentSkillValue) {
    // 失败但有機會成長
    success = true; // 實際上是失敗，但會成長
    increment = Math.floor(Math.random() * 10) + 1; // 1d10
  } else {
    // 成功
    success = true;
  }
  
  // 如果是失敗但成長
  if (d100 > currentSkillValue && d100 <= 95) {
    // 成功成長
    const newSkillValue = currentSkillValue + increment;
    saveAttr(groupId, userId, skillName, newSkillValue);
    
    const playerName = getPlayerName(groupId, userId);
    ctx.send(`${playerName}的${skillName}技能從${currentSkillValue}成長至${newSkillValue}！\n(投出了${d100}，大於當前值${currentSkillValue}，成長了${increment}點)`);
    
    // 记录日志
    gameLogRecorder.recordEvent(groupId, 'default', {
      type: 'skill_increase',
      userId: userId,
      message: `${playerName}的${skillName}技能成長: ${currentSkillValue} → ${newSkillValue}`,
      data: {
        skill: skillName,
        old_value: currentSkillValue,
        new_value: newSkillValue,
        increment: increment
      }
    });
  } else if (d100 <= currentSkillValue) {
    // 成功但未成長
    const playerName = getPlayerName(groupId, userId);
    ctx.send(`${playerName}的${skillName}技能檢定成功！\n(投出了${d100}，小於等於當前值${currentSkillValue}，技能值不變)`);
  } else {
    // 失敗且未成長 (大失敗或普通失敗)
    const playerName = getPlayerName(groupId, userId);
    if (d100 > 95) {
      ctx.send(`${playerName}的${skillName}技能檢定大失敗！\n(投出了${d100}，大於95，技能值不變)`);
    } else {
      ctx.send(`${playerName}的${skillName}技能檢定失敗！\n(投出了${d100}，大於當前值${currentSkillValue}，但技能值不變)`);
    }
  }
}

// nn命令：设置昵称
function nnCommand(ctx, e, argv) {
  const groupId = e.group_id;
  const userId = e.user_id;
  const nickname = argv.args.join(' ');
  
  if (!nickname) {
    ctx.send('请指定昵称，格式：.nn 昵称');
    return;
  }
  
  const key = `${groupId}_${userId}`;
  playerNames[key] = nickname;
  savePlayerNames();
  
  ctx.send(`昵称已设置为: ${nickname}`);
  
  // 记录日志
  gameLogRecorder.recordEvent(groupId, 'default', {
    type: 'nickname_set',
    userId: userId,
    message: `昵称设置为: ${nickname}`
  });
}

// setcoc命令：设置房规
function setcocCommand(ctx, e, argv) {
  const ruleIndex = argv.args[0] || '';
  
  if (ruleIndex === 'help' || ruleIndex === '') {
    let helpText = "设置房规:\n";
    helpText += ".setcoc 0-5 // 设置常见的0-5房规，0为规则书，2为国内常用规则\n";
    helpText += ".setcoc dg // delta green 扩展规则\n";
    helpText += ".setcoc details // 列出所有规则及其解释文本\n\n";
    
    // 显示所有规则
    for (const [key, value] of Object.entries(COC_RULES)) {
      helpText += `.setcoc ${key} // ${value.name}: ${value.desc}\n`;
    }
    
    ctx.send(helpText);
    return;
  }
  
  if (ruleIndex === 'details') {
    let detailsText = "当前有coc7规则如下:\n";
    for (const [key, value] of Object.entries(COC_RULES)) {
      const desc = value.desc.replace(/\n/g, " ");
      detailsText += `.setcoc ${key} // ${value.name}: ${desc}\n`;
    }
    ctx.send(detailsText);
    return;
  }
  
  let newRuleIndex = -1;
  
  if (ruleIndex === 'dg') {
    newRuleIndex = 11;
  } else {
    const parsedIndex = parseInt(ruleIndex);
    if (!isNaN(parsedIndex) && COC_RULES[parsedIndex]) {
      newRuleIndex = parsedIndex;
    }
  }
  
  if (newRuleIndex === -1) {
    // 检查是否是自定义规则
    for (const [key, value] of Object.entries(COC_RULES)) {
      if (value.name.toLowerCase() === ruleIndex.toLowerCase()) {
        newRuleIndex = parseInt(key);
        break;
      }
    }
  }
  
  if (newRuleIndex === -1) {
    ctx.send(`未找到规则 "${ruleIndex}"`);
    return;
  }
  
  // 设置房规（存储在群配置中，这里简化为存储在内存中）
  if (!global.cocRules) global.cocRules = {};
  const groupId = e.group_id.toString();
  global.cocRules[groupId] = newRuleIndex;
  
  const rule = COC_RULES[newRuleIndex];
  ctx.send(`已切换房规为${rule.name}:\n${rule.desc}\nCOC7规则扩展已自动开启`);
}

// rav/rcv命令：对抗检定
function ravCommand(ctx, e, argv) {
  const params = argv.args.join(' ');
  
  if (!params || params === 'help') {
    ctx.send(".rav/.rcv <技能> @某人 // 自己和某人进行对抗检定\n" +
             ".rav <技能1> <技能2> @某A @某B // 对A和B两人做对抗检定，分别使用输入的两个技能数值");
    return;
  }
  
  // 这里简化实现，只支持基本的对抗检定
  // 在实际实现中，需要解析@用户和技能值
  const args = argv.args;
  if (args.length < 1) {
    ctx.send("请指定技能进行对抗检定");
    return;
  }
  
  // 简化版：两个玩家对同一技能进行检定
  const skillName = args[0];
  const player1Name = getPlayerName(e.group_id, e.user_id);
  
  // 获取玩家1的技能值
  const skillValue1 = getAttr(e.group_id, e.user_id, skillName.toLowerCase()) || 0;
  if (skillValue1 === 0) {
    ctx.send(`${player1Name}没有"${skillName}"技能，请先使用.st设置`);
    return;
  }
  
  // 简化实现，模拟一个对手
  const d100_1 = Math.floor(Math.random() * 100) + 1;
  const ruleIndex = (global.cocRules && global.cocRules[e.group_id.toString()]) || 0;
  const result1 = resultCheck(ruleIndex, d100_1, skillValue1, 1, {});
  
  // 简化实现，模拟对手检定
  const d100_2 = Math.floor(Math.random() * 100) + 1;
  const skillValue2 = skillValue1; // 假设对手技能值相同
  const result2 = resultCheck(ruleIndex, d100_2, skillValue2, 1, {});
  
  // 确定胜负
  let winner = '';
  let winDetails = '';
  if (result1.successRank > 0 && result2.successRank <= 0) {
    winner = player1Name;
    winDetails = `${player1Name}成功而对手失败`;
  } else if (result1.successRank <= 0 && result2.successRank > 0) {
    winner = "对手";
    winDetails = `${player1Name}失败而对手成功`;
  } else if (result1.successRank > result2.successRank) {
    winner = player1Name;
    winDetails = `${player1Name}成功等级更高`;
  } else if (result2.successRank > result1.successRank) {
    winner = "对手";
    winDetails = `对手成功等级更高`;
  } else {
    // 成功等级相同，比较骰子点数
    if (d100_1 < d100_2) {
      winner = player1Name;
      winDetails = `${player1Name}骰点更低`;
    } else if (d100_2 < d100_1) {
      winner = "对手";
      winDetails = `对手骰点更低`;
    } else {
      winner = "平局";
      winDetails = "完全平局";
    }
  }
  
  const successText1 = getSuccessText(result1.successRank);
  const successText2 = getSuccessText(result2.successRank);
  
  const resultText = `${player1Name}的${skillName}对抗检定:\n` +
                    `${player1Name}: ${skillName}(${skillValue1}) 骰出${d100_1} (${successText1})\n` +
                    `对手: ${skillName}(${skillValue2}) 骰出${d100_2} (${successText2})\n` +
                    `胜者: ${winner}\n` +
                    `详情: ${winDetails}`;
  
  ctx.send(resultText);
}

// sc命令：理智检定
function scCommand(ctx, e, argv) {
  if (argv.args.length === 0) {
    ctx.send(".sc <成功时掉san>/<失败时掉san> // 对理智进行一次D100检定，根据结果扣除理智\n" +
             ".sc <失败时掉san> //同上，简易写法");
    return;
  }
  
  // 解析参数
  const fullArg = argv.args.join(' ');
  let successLoss = '0'; // 默认成功时无损失
  let failLoss;
  
  if (fullArg.includes('/')) {
    const parts = fullArg.split('/');
    successLoss = parts[0].trim();
    failLoss = parts[1].trim();
  } else {
    failLoss = fullArg.trim();
  }
  
  // 获取当前SAN值
  const sanValue = getAttr(e.group_id, e.user_id, '理智') || 
                  getAttr(e.group_id, e.user_id, 'san') || 
                  getAttr(e.group_id, e.user_id, '理智值') || 0;
  
  if (sanValue === 0) {
    ctx.send("未找到角色的理智值，请先使用.st设置理智/意志");
    return;
  }
  
  // 执行理智检定
  const ruleIndex = (global.cocRules && global.cocRules[e.group_id.toString()]) || 0;
  const checkResult = sanityCheck(sanValue, successLoss, failLoss);
  
  // 更新SAN值
  saveAttr(e.group_id, e.user_id, '理智', checkResult.newSan);
  saveAttr(e.group_id, e.user_id, 'san', checkResult.newSan);
  saveAttr(e.group_id, e.user_id, '理智值', checkResult.newSan);
  
  const playerName = getPlayerName(e.group_id, e.user_id);
  let resultText = `${playerName}的理智检定:\n` +
                   `D100=${checkResult.d100}, 判定值=${sanValue}\n` +
                   `结果: ${checkResult.success ? '成功' : '失败'}\n` +
                   `理智损失: ${checkResult.sanLoss}点\n` +
                   `当前理智: ${checkResult.newSan}点`;
  
  if (checkResult.isCrazy) {
    if (checkResult.newSan === 0) {
      resultText += `\n[提示: 角色永久疯狂]`;
    } else if (checkResult.sanLoss >= 5) {
      resultText += `\n[提示: 角色临时疯狂]`;
    }
  }
  
  // 记录日志
  gameLogRecorder.recordEvent(e.group_id, 'default', {
    type: 'san_check',
    userId: e.user_id,
    message: `${playerName} 进行理智检定: D100=${checkResult.d100}, 损失${checkResult.sanLoss}点SAN`,
    data: {
      san: sanValue,
      roll: checkResult.d100,
      loss: checkResult.sanLoss,
      newSan: checkResult.newSan
    }
  });
  
  ctx.send(resultText);
}

// ti命令：临时性疯狂症状
function tiCommand(ctx, e, argv) {
  if (argv.args[0] === 'help') {
    ctx.send(".ti // 抽取一个临时性疯狂症状");
    return;
  }
  
  // 骰1D10
  const num = Math.floor(Math.random() * 10) + 1;
  const extraNum1 = Math.floor(Math.random() * 10) + 1; // 骰1D10持续轮数
  
  let desc = '';
  switch (num) {
    case 1:
      desc = `失憶：调查员会发现自己只记得最后身处的安全地点，却没有任何来到这里的记忆。例如，调查员前一刻还在家中吃着早饭，下一刻就已经直面着不知名的怪物。这将会持续 1D10=${extraNum1} 轮。`;
      break;
    case 2:
      desc = `假性残疾：调查员陷入了心理性的失明，失聪以及躯体缺失感中，持续 1D10=${extraNum1} 轮。`;
      break;
    case 3:
      desc = `暴力倾向：调查员陷入了六亲不认的暴力行为中，对周围的敌人与友方进行着无差别的攻击，持续 1D10=${extraNum1} 轮。`;
      break;
    case 4:
      desc = `偏执：调查员陷入了严重的偏执妄想之中。有人在暗中窥视着他们，同伴中有人背叛了他们，没有人可以信任，万事皆虚。持续 1D10=${extraNum1} 轮`;
      break;
    case 5:
      desc = `人际依赖：守秘人适当参考调查员的背景中重要之人的条目，调查员因为一些原因而将他人误认为了他重要的人并且努力的会与那个人保持那种关系，持续 1D10=${extraNum1} 轮`;
      break;
    case 6:
      desc = `昏厥：调查员当场昏倒，并需要 1D10=${extraNum1} 轮才能苏醒。`;
      break;
    case 7:
      desc = `逃避行为：调查员会用任何的手段试图逃离现在所处的位置，即使这意味着开走唯一一辆交通工具并将其它人抛诸脑后，调查员会试图逃离 1D10=${extraNum1} 轮。`;
      break;
    case 8:
      desc = `歇斯底里：调查员表现出大笑，哭泣，嘶吼，害怕等的极端情绪表现，持续 1D10=${extraNum1} 轮。`;
      break;
    case 9:
      desc = `恐惧：调查员通过一次 D100=${extraNum1} 来选择一个恐惧源，就算这一恐惧的事物是并不存在的，调查员的症状会持续 1D10=${extraNum1} 轮。\n`;
      const fearResult = getRandomFearSymptom();
      desc += `恐惧症状: ${fearResult.roll} - ${fearResult.symptom}`;
      break;
    case 10:
      desc = `躁狂：调查员通过一次 D100=${extraNum1} 来选择一个躁狂的诱因，这个症状将会持续 1D10=${extraNum1} 轮。\n`;
      const maniaResult = getRandomManiaSymptom();
      desc += `躁狂症状: ${maniaResult.roll} - ${maniaResult.symptom}`;
      break;
    default:
      desc = "未知症状";
  }
  
  const playerName = getPlayerName(e.group_id, e.user_id);
  const resultText = `${playerName}的临时性疯狂症状:\n` +
                     `1D10=${num}\n` +
                     desc;
  
  // 记录日志
  gameLogRecorder.recordEvent(e.group_id, 'default', {
    type: 'insanity',
    userId: e.user_id,
    message: `${playerName} 抽取临时性疯狂症状: ${desc}`,
    data: {
      type: 'temporary',
      roll: num,
      symptom: desc
    }
  });
  
  ctx.send(resultText);
}

// li命令：总结性疯狂症状
function liCommand(ctx, e, argv) {
  if (argv.args[0] === 'help') {
    ctx.send(".li // 抽取一个总结性疯狂症状");
    return;
  }
  
  // 骰1D10
  const num = Math.floor(Math.random() * 10) + 1;
  const extraNum1 = Math.floor(Math.random() * 10) + 1; // 骰1D10持续时间
  
  let desc = '';
  switch (num) {
    case 1:
      desc = "失憶：回过神来，调查员们发现自己身处一个陌生的地方，并忘记了自己是谁。记忆会随时间恢复。";
      break;
    case 2:
      desc = `被窃：调查员在 1D10=${extraNum1} 小时后恢复清醒，发觉自己被盗，身体毫发无损。如果调查员携带着宝贵之物（见调查员背景），做幸运检定来决定其是否被盗。所有有价值的东西无需检定自动消失。`;
      break;
    case 3:
      desc = `遍体鳞伤：调查员在 1D10=${extraNum1} 小时后恢复清醒，发现自己身上满是拳痕和瘀伤。生命值减少到疯狂前的一半，但这不会造成重伤。调查员没有被窃。这种伤害如何持续到现在由守秘人决定。`;
      break;
    case 4:
      desc = "暴力倾向：调查员陷入强烈的暴力与破坏欲之中。调查员回过神来可能会理解自己做了什么也可能毫无印象。调查员对谁或何物施以暴力，他们是杀人还是仅仅造成了伤害，由守秘人决定。";
      break;
    case 5:
      desc = "极端信念：查看调查员背景中的思想信念，调查员会采取极端和疯狂的表现手段展示他们的思想信念之一。比如一个信教者会在地铁上高声布道。";
      break;
    case 6:
      desc = `重要之人：考虑调查员背景中的重要之人，及其重要的原因。在 1D10=${extraNum1} 小时或更久的时间中，调查员将不顾一切地接近那个人，并为他们之间的关系做出行动。`;
      break;
    case 7:
      desc = "被收容：调查员在精神病院病房或警察局牢房中回过神来，他们可能会慢慢回想起导致自己被关在这里的事情。";
      break;
    case 8:
      desc = "逃避行为：调查员恢复清醒时发现自己在很远的地方，也许迷失在荒郊野岭，或是在驶向远方的列车或长途汽车上。";
      break;
    case 9:
      desc = `恐惧：调查员患上一个新的恐惧症状。通过 D100=${extraNum1} 来决定症状。\n`;
      const fearResult = getRandomFearSymptom();
      desc += `恐惧症状: ${fearResult.roll} - ${fearResult.symptom}`;
      break;
    case 10:
      desc = `躁狂：调查员患上一个新的狂躁症状。通过 D100=${extraNum1} 来决定症状。\n`;
      const maniaResult = getRandomManiaSymptom();
      desc += `躁狂症状: ${maniaResult.roll} - ${maniaResult.symptom}`;
      break;
    default:
      desc = "未知症状";
  }
  
  const playerName = getPlayerName(e.group_id, e.user_id);
  const resultText = `${playerName}的总结性疯狂症状:\n` +
                     `1D10=${num}\n` +
                     desc;
  
  // 记录日志
  gameLogRecorder.recordEvent(e.group_id, 'default', {
    type: 'insanity',
    userId: e.user_id,
    message: `${playerName} 抽取总结性疯狂症状: ${desc}`,
    data: {
      type: 'summary',
      roll: num,
      symptom: desc
    }
  });
  
  ctx.send(resultText);
}

// coc命令：生成人物卡
function cocCommand(ctx, e, argv) {
  if (argv.args[0] === 'help') {
    ctx.send(".coc [<数量>] // 制卡指令，返回<数量>组人物属性（带称号）");
    return;
  }
  
  let count = 1;
  if (argv.args[0]) {
    const num = parseInt(argv.args[0]);
    if (!isNaN(num)) {
      count = Math.min(num, 10); // 限制最大生成数量
    }
  }
  
  const characters = generateCOCCharacter(count);
  const playerName = getPlayerName(e.group_id, e.user_id);
  
  const results = characters.map((char, index) => {
    return `【${char.id}】「${char.title}」\n` +
           `${char.stars}\n` +
           `力量:${char.strength} 敏捷:${char.dexterity} 意志:${char.power}\n` +
           `体质:${char.constitution} 外貌:${char.appearance} 教育:${char.education}\n` +
           `体型:${char.size} 智力:${char.intelligence} 幸运:${char.luck}\n` +
           `HP:${char.hp} <DB:${char.db}> [总分:${char.total}]`;
  });
  
  const resultText = `<${playerName}>的七版COC人物作成:\n` + 
                     results.join('\n----------------------\n');
  
  ctx.send(resultText);
}

// log命令：跑团日志相关
function logCommand(ctx, e, argv) {

  const groupId = e.group_id;
  const userId = e.user_id;
  const action = argv.args[0] || '';
  
  if (action === 'list' || action === '列表') {
    // 列出所有日志
    const logNames = gameLogRecorder.getLogList(groupId);
    if (logNames.length === 0) {
      ctx.send('当前群组暂无日志记录');
      return;
    }
    
    let response = '当前群组日志列表:\n';
    response += logNames.map(name => `- ${name}`).join('\n');
    ctx.send(response);
  } else if (action === 'get' || action === 'show' || action === '查看') {
    const logName = argv.args[1] || 'default';
    const logs = gameLogRecorder.getLogContent(groupId, logName, 20); // 增加显示数量
    
    if (logs.length === 0) {
      ctx.send(`日志"${logName}"暂无内容`);
      return;
    }
    
    const logText = logs.map(log => 
      `[${log.time}] ${log.user}: ${log.message}`
    ).join('\n');
    
    ctx.send(`日志"${logName}"最近记录:\n${logText}`);
  } else if (action === 'stat' || action === 'stats' || action === '统计') {
    // 统计信息
    const logName = argv.args[1] || 'default';
    const showAll = argv.args.includes('--all'); // 检查是否包含--all参数
    const stats = gameLogRecorder.getLogStats(groupId, logName);
    
    if (stats.total === 0) {
      ctx.send(`日志"${logName}"暂无内容`);
      return;
    }
    
    let statText = `日志"${logName}"统计信息:\n`;
    statText += `总记录数: ${stats.total}\n`;
    statText += `总检定数: ${stats.checks}\n`;
    if (stats.checks > 0) {
      statText += `成功率: ${stats.successRate}% (${stats.successes}/${stats.checks})\n`;
    }
    
    statText += '\n各玩家统计:\n';
    for (const [playerId, playerStats] of Object.entries(stats.players)) {
      const playerName = getPlayerName(groupId, playerId);
      const rate = playerStats.checks > 0 ? (playerStats.successes / playerStats.checks * 100).toFixed(1) : 0;
      statText += `${playerName}: 检定${playerStats.checks}次, 成功${playerStats.successes}次 (${rate}%)\n`;
    }
    
    if (!showAll) {
      statText += '\n若需查看全团，请使用 .log stat --all';
    }
    
    ctx.send(statText);
  } else if (action === 'new') {
    // 新建日志
    const logName = argv.args[1] || `log_${Date.now()}`;
    
    // 检查是否已有开启的日志
    const activeLogs = gameLogRecorder.getLogList(groupId).filter(name => {
      const content = gameLogRecorder.getLogContent(groupId, name);
      return content.length > 0;
    });
    
    if (activeLogs.length > 0) {
      ctx.send(`已有开启的日志: ${activeLogs.join(', ')}，请先结束或清空后再新建`);
      return;
    }
    
    // 创建一个新日志（通过记录一个初始事件）
    gameLogRecorder.recordEvent(groupId, logName, {
      type: 'log_start',
      userId: userId,
      message: `日志"${logName}"已创建`,
      data: { action: 'new' }
    });
    
    ctx.send(`新日志"${logName}"已创建并开始记录`);
  } else if (action === 'on') {
    // 开始记录
    const logName = argv.args[1] || 'default';
    
    // 检查是否已有开启的日志
    const activeLogs = gameLogRecorder.getLogList(groupId).filter(name => {
      const content = gameLogRecorder.getLogContent(groupId, name);
      return content.length > 0;
    });
    
    if (activeLogs.length > 0) {
      ctx.send(`已有开启的日志: ${activeLogs.join(', ')}，请先结束当前日志`);
      return;
    }
    
    // 确保日志存在
    if (!gameLogRecorder.getLogList(groupId).includes(logName)) {
      // 创建一个新日志
      gameLogRecorder.recordEvent(groupId, logName, {
        type: 'log_start',
        userId: userId,
        message: `日志"${logName}"已开启`,
        data: { action: 'on' }
      });
    }
    
    ctx.send(`日志"${logName}"已开启并开始记录`);
  } else if (action === 'off') {
    // 暂停记录
    ctx.send('日志记录已暂停');
  } else if (action === 'end') {
    // 完成记录
    ctx.send('日志记录已结束');
  } else if (action === 'export' || action === '导出') {
    const logName = argv.args[1] || 'default';
    const text = gameLogRecorder.exportLogText(groupId, logName, getPlayerName);
    
    if (!text) {
      ctx.send(`日志"${logName}"暂无内容可导出`);
      return;
    }
    
    // 将文本保存到文件
    // 确保group_id是字符串类型并处理格式
    let groupIdStr = String(e.group_id);
    if (typeof e.group_id === 'string') {
      groupIdStr = e.group_id.replace('QQ-Group:', '');
    } else {
      // 如果不是字符串，尝试转换为字符串
      groupIdStr = String(e.group_id);
    }
    const fileName = `【${logName}】${new Date().toISOString().slice(0, 19).replace(/-/g, '').replace(/:/g, '').replace('T', '')}(${groupIdStr}).txt`;
    const filePath = path.join(attrDir, 'log-exports', fileName);
    const exportDir = path.join(attrDir, 'log-exports');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(filePath, text, 'utf8');
    
    // 发送到群文件
    // ctx对象中应该有ws连接，使用正确的OneBot API上传文件
    try {
      // 使用ctx的ws连接发送上传群文件的请求
      if (ctx.ws && typeof ctx.ws.send === 'function') {
        // 确保文件存在后再尝试上传
        if (fs.existsSync(filePath)) {
          ctx.ws.send(JSON.stringify({
            action: "upload_group_file",
            params: {
              group_id: e.group_id,
              file: filePath,
              name: fileName
            }
          }));
          
          ctx.send(`日志"${logName}"已导出并尝试上传到群文件: ${fileName}`);
        } else {
          ctx.send(`日志"${logName}"已导出为文件: ${fileName}，但文件不存在，无法上传`);
        }
      } else {
        // 如果无法直接上传到群文件，至少把文件路径发给用户
        ctx.send(`日志"${logName}"已导出为文件: ${fileName}，文件已保存至 ${filePath}，请手动上传`);
      }
    } catch (err) {
      console.error('发送群文件失败:', err);
      // 如果发送文件失败，至少告知用户文件已生成
      ctx.send(`日志"${logName}"已导出为文件: ${fileName}，但发送到群文件失败。文件已保存至 ${filePath}`);
    }
  } else if (action === 'clear' || action === '清空' || action === 'del' || action === 'rm') {
    const logName = argv.args[1] || 'default';
    const success = gameLogRecorder.clearLog(groupId, logName);
    
    if (success) {
      ctx.send(`日志"${logName}"已清空`);
    } else {
      ctx.send(`清空日志"${logName}"失败，可能不存在该日志`);
    }
  } else {
    // 默认显示当前日志状态
    const logNames = gameLogRecorder.getLogList(groupId);
    const totalLogs = logNames.reduce((sum, name) => {
      const content = gameLogRecorder.getLogContent(groupId, name);
      return sum + content.length;
    }, 0);
    
    let statusText = `当前故事: default\n`;
    statusText += `当前状态: 关闭\n`;
    statusText += `已记录文本${totalLogs}条\n`;
    
    // 添加帮助文本
    statusText += `\n日志指令:\n`;
    statusText += `.log new [<日志名>] // 新建日志并开始记录\n`;
    statusText += `.log on [<日志名>]  // 开始记录\n`;
    statusText += `.log off // 暂停记录\n`;
    statusText += `.log end // 完成记录\n`;
    statusText += `.log get [<日志名>] // 查看日志\n`;
    statusText += `.log list // 查看当前群的日志列表\n`;
    statusText += `.log del <日志名> // 删除一份日志\n`;
    statusText += `.log stat [<日志名>] // 查看统计\n`;
    statusText += `.log export <日志名> // 导出日志`;
    
    ctx.send(statusText);
  }
}

// r命令：骰子
function rCommand(ctx, e, argv) {
  const groupId = e.group_id;
  const expr = argv.args.join('');
  if (!expr) {
    ctx.send('请指定骰子表达式，如: .r 1d6');
    return;
  }
  
  try {
    const result = rollExpr(expr);
    if (result === null) {
      ctx.send('无效的骰子表达式');
      return;
    }
    
    const playerName = getPlayerName(groupId, e.user_id);
    
    // 记录日志
    gameLogRecorder.recordEvent(groupId, 'default', {
      type: 'roll',
      userId: e.user_id,
      message: `${playerName} 骰出: ${expr} = ${result}`,
      data: {
        expr: expr,
        result: result
      }
    });
    
    ctx.send(`${playerName} 骰出: ${expr} = ${result}`);
  } catch (err) {
    ctx.send('骰子表达式错误: ' + err.message);
  }
}

// 创建扩展插件
const ext = globalThis.seal.ext.new('coc7', '铭茗', '1.0.0');

// 设置.st命令
const stCmd = ext.cmdMap['st'] = globalThis.seal.ext.newCmdItemInfo();
stCmd.name = 'st';
stCmd.help = '设置属性，格式: .st 力量60 敏捷50';
stCmd.solve = (ctx, e, argv) => {
  try {
    stCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('st命令错误:', err);
    ctx.send('设置属性时出错: ' + err.message);
    return true;
  }
};

// 设置.stshow命令
const stshowCmd = ext.cmdMap['stshow'] = globalThis.seal.ext.newCmdItemInfo();
stshowCmd.name = 'stshow';
stshowCmd.help = '显示属性，格式: .stshow';
stshowCmd.solve = (ctx, e, argv) => {
  try {
    stshowCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('stshow命令错误:', err);
    ctx.send('显示属性时出错: ' + err.message);
    return true;
  }
};

// 设置.ra命令
const raCmd = ext.cmdMap['ra'] = globalThis.seal.ext.newCmdItemInfo();
raCmd.name = 'ra';
raCmd.help = '属性检定，格式: .ra 力量 或 .ra 困难力量';
raCmd.solve = (ctx, e, argv) => {
  try {
    raCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('ra命令错误:', err);
    ctx.send('属性检定时出错: ' + err.message);
    return true;
  }
};

// 设置.en命令
const enCmd = ext.cmdMap['en'] = globalThis.seal.ext.newCmdItemInfo();
enCmd.name = 'en';
enCmd.help = '技能成长，格式: .en 侦查';
enCmd.solve = (ctx, e, argv) => {
  try {
    enCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('en命令错误:', err);
    ctx.send('技能成长时出错: ' + err.message);
    return true;
  }
};

// 设置.nn命令
const nnCmd = ext.cmdMap['nn'] = globalThis.seal.ext.newCmdItemInfo();
nnCmd.name = 'nn';
nnCmd.help = '设置昵称，格式: .nn 昵称';
nnCmd.solve = (ctx, e, argv) => {
  try {
    nnCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('nn命令错误:', err);
    ctx.send('设置昵称时出错: ' + err.message);
    return true;
  }
};

// 设置.log命令
const logCmd = ext.cmdMap['log'] = globalThis.seal.ext.newCmdItemInfo();
logCmd.name = 'log';
logCmd.help = '跑团日志，格式: .log list/.log stat/.log export';
logCmd.solve = (ctx, e, argv) => {
  try {
    logCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('log命令错误:', err);
    ctx.send('日志操作时出错: ' + err.message);
    return true;
  }
};

// 设置.setcoc命令
const setCocCmd = ext.cmdMap['setcoc'] = globalThis.seal.ext.newCmdItemInfo();
setCocCmd.name = 'setcoc';
setCocCmd.help = '设置房规，格式: .setcoc 0-5 或 .setcoc dg';
setCocCmd.solve = (ctx, e, argv) => {
  try {
    setcocCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('setcoc命令错误:', err);
    ctx.send('设置房规时出错: ' + err.message);
    return true;
  }
};

// 设置.rav命令
const ravCmd = ext.cmdMap['rav'] = globalThis.seal.ext.newCmdItemInfo();
ravCmd.name = 'rav';
ravCmd.help = '对抗检定，格式: .rav <技能> @某人';
ravCmd.solve = (ctx, e, argv) => {
  try {
    ravCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('rav命令错误:', err);
    ctx.send('对抗检定时出错: ' + err.message);
    return true;
  }
};

// 设置.sc命令
const scCmd = ext.cmdMap['sc'] = globalThis.seal.ext.newCmdItemInfo();
scCmd.name = 'sc';
scCmd.help = '理智检定，格式: .sc <成功时掉san>/<失败时掉san>';
scCmd.solve = (ctx, e, argv) => {
  try {
    scCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('sc命令错误:', err);
    ctx.send('理智检定时出错: ' + err.message);
    return true;
  }
};

// 设置.ti命令
const tiCmd = ext.cmdMap['ti'] = globalThis.seal.ext.newCmdItemInfo();
tiCmd.name = 'ti';
tiCmd.help = '临时性疯狂症状，格式: .ti';
tiCmd.solve = (ctx, e, argv) => {
  try {
    tiCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('ti命令错误:', err);
    ctx.send('抽取临时性疯狂症状时出错: ' + err.message);
    return true;
  }
};

// 设置.li命令
const liCmd = ext.cmdMap['li'] = globalThis.seal.ext.newCmdItemInfo();
liCmd.name = 'li';
liCmd.help = '总结性疯狂症状，格式: .li';
liCmd.solve = (ctx, e, argv) => {
  try {
    liCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('li命令错误:', err);
    ctx.send('抽取总结性疯狂症状时出错: ' + err.message);
    return true;
  }
};

// 设置.coc命令
const cocCmd = ext.cmdMap['coc'] = globalThis.seal.ext.newCmdItemInfo();
cocCmd.name = 'coc';
cocCmd.help = 'COC制卡，格式: .coc [<数量>]';
cocCmd.solve = (ctx, e, argv) => {
  try {
    cocCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('coc命令错误:', err);
    ctx.send('COC制卡时出错: ' + err.message);
    return true;
  }
};

// 注册扩展
globalThis.seal.ext.register(ext);