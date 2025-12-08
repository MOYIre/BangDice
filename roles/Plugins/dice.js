import { rollExpr } from '../core/dice.js';

// 简单的骰子命令
const ext = globalThis.seal.ext.new('dice', '铭茗', '1.0.0');

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
    const playerName = `玩家${e.user_id}`;
    ctx.send(`${playerName} 骰出: ${expr} = ${result}`);
  } catch (err) {
    ctx.send('骰子表达式错误: ' + err.message);
  }
  return true;
};

globalThis.seal.ext.register(ext);