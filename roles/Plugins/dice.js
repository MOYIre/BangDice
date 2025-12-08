import { rollExpr } from '../../src/core/dice.js';
import fs from 'fs';
import path from 'path';

// 简单的骰子命令
const ext = globalThis.seal.ext.new('dice', '铭茗', '1.0.0');

// 存储玩家昵称
let playerNames = {};
const attrDir = path.join(process.cwd(), 'roles');
const nameFile = path.join(attrDir, 'playerNames.json');
if (fs.existsSync(nameFile)) {
  try {
    playerNames = JSON.parse(fs.readFileSync(nameFile, 'utf8'));
  } catch (e) {
    console.error('读取玩家昵称文件失败:', e.message);
  }
}

// 获取玩家名称（优先使用昵称，否则使用用户ID）
function getPlayerName(groupId, userId) {
  const key = `${groupId}_${userId}`;
  return playerNames[key] || `玩家${userId}`;
}

// .r 命令
const rCmd = ext.cmdMap['r'] = globalThis.seal.ext.newCmdItemInfo();
rCmd.name = 'r';
rCmd.help = '掷骰指令\n.r [表达式] - 掷骰，如 .r 1d6+2';
rCmd.solve = (ctx, e, argv) => {
  try {
    const expr = argv.args.join('');
    if (!expr) {
      ctx.send('请指定骰子表达式，如: .r 1d6');
      return true;
    }

    const result = rollExpr(expr);
    if (result === null) {
      ctx.send('无效的骰子表达式');
      return true;
    }

    // 获取用户ID作为玩家名
    const playerName = getPlayerName(e.group_id, e.user_id);
    ctx.send(`${playerName} 骰出: ${expr} = ${result}`);
  } catch (err) {
    ctx.send('骰子表达式错误: ' + err.message);
  }
  return true;
};

globalThis.seal.ext.register(ext);