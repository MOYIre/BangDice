import { resultCheck, successRankToKey } from '../core/coc.js';
import { rollExpr } from '../core/dice.js';
import { renderKey, loadTemplates } from '../utils/templates.js';
import fs from 'fs';
import path from 'path';

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
  return playerAttrs[groupKey][userKey][key] || null;
}

// 解析属性字符串
function parseAttrs(text) {
  const attrs = {};
  // 匹配各种属性格式：力量45、str45、力量:45等
  const regex = /([a-zA-Z\u4e00-\u9fa5]+)(\d+)|([a-zA-Z\u4e00-\u9fa5]+)[:]([0-9]+)/g;
  let match;
  
  // 使用字符迭代方法作为备选，以防正则表达式在某些情况下出错
  let i = 0;
  while (i < text.length) {
    let attrName = '';
    // 跳过非字母/非中文字符
    while (i < text.length && !/[a-zA-Z\u4e00-\u9fa5]/.test(text[i])) i++;
    if (i >= text.length) break;
    
    // 读取属性名
    while (i < text.length && /[a-zA-Z\u4e00-\u9fa5]/.test(text[i])) {
      attrName += text[i];
      i++;
    }
    
    // 跳过可能的分隔符
    while (i < text.length && /[:：]/.test(text[i])) i++;
    
    // 读取数值
    let valueStr = '';
    while (i < text.length && /\d/.test(text[i])) {
      valueStr += text[i];
      i++;
    }
    
    if (attrName && valueStr) {
      attrs[attrName.toLowerCase()] = parseInt(valueStr);
    }
  }
  
  return attrs;
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
  
  for (const [key, value] of Object.entries(attrs)) {
    saveAttr(groupId, userId, key, value);
  }
  
  const attrList = Object.entries(attrs).map(([k, v]) => `${k}${v}`).join(' ');
  const playerName = getPlayerName(groupId, userId);
  ctx.send(`${playerName} 的属性已设置: ${attrList}`);
}

// stshow命令：显示属性
function stshowCommand(ctx, e, argv) {
  const groupId = e.group_id;
  const userId = e.user_id;
  const attrs = playerAttrs[groupId]?.[userId] || {};
  
  if (Object.keys(attrs).length === 0) {
    ctx.send('未发现当前角色的属性记录，如同空白的五线谱等待填满。');
    return;
  }
  
  const attrList = Object.entries(attrs)
    .map(([key, value]) => `${key}${value}`)
    .join(' ');
  
  const playerName = getPlayerName(groupId, userId);
  ctx.send(`${playerName} 的属性:\n${attrList}`);
}

// ra命令：属性检定
function raCommand(ctx, e, argv) {
  const groupId = e.group_id;
  const userId = e.user_id;
  const params = argv.args.join('');
  
  if (!params) {
    ctx.send('请指定要检定的属性');
    return;
  }
  
  // 解析难度：困难、极难、大成功
  let difficulty = 1; // 普通
  let attrName = params.toLowerCase();
  
  if (params.toLowerCase().startsWith('困难')) {
    difficulty = 2;
    attrName = params.substring(2).toLowerCase();
  } else if (params.toLowerCase().startsWith('极难')) {
    difficulty = 3;
    attrName = params.substring(2).toLowerCase();
  } else if (params.toLowerCase().startsWith('大成功')) {
    difficulty = 4;
    attrName = params.substring(3).toLowerCase();
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
  
  // 构建上下文
  const ctxData = {
    playerName: playerName,
    attrName: attrName,
    attrValue: finalValue,
    rollValue: d100,
    difficulty: difficulty === 1 ? '普通' : difficulty === 2 ? '困难' : difficulty === 3 ? '极难' : '大成功'
  };
  
  // 生成结果消息
  const resultText = renderKey(templates, rankKey, ctxData) || 
    (result.successRank === 1 ? 
      `${playerName}的${attrName}检定(难度: ${ctxData.difficulty})\n[${attrValue}+技能: ${skillBonus}] VS [1d100: ${d100}] = ${d100 <= finalValue ? '成功' : '失败'}` :
      `${playerName}的${attrName}检定(难度: ${ctxData.difficulty})\n[${attrValue}+技能: ${skillBonus}] VS [1d100: ${d100}] = ${d100 <= finalValue ? '成功' : '失败'}`);
  
  ctx.send(resultText);
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
}

// r命令：骰子
function rCommand(ctx, e, argv) {
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

// 设置.nn命令
const nnCmd = ext.cmdMap['nn'] = globalThis.seal.ext.newCmdItemInfo();

Cmd.name = 'nn';
Cmd.help = '设置昵称，格式: .nn 昵称';
Cmd.solve = (ctx, e, argv) => {
  try {
    nnCommand(ctx, e, argv);
    return true;
  } catch (err) {
    console.error('nn命令错误:', err);
    ctx.send('设置昵称时出错: ' + err.message);
    return true;
  }
};

// 注册扩展
.globalThis.seal.ext.register(ext);