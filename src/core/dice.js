export function rollExpr(expr) {
  expr = expr.replace(/\s+/g, "");
  
  // 修复正则表达式匹配顺序问题：将更具体的模式放在前面
  // 使用一个更精确的正则表达式来匹配 d 骰表达式
  let tokens = expr.match(/(\d*d\d+|\d+|[+\-*/()])/gi);
  if (!tokens) return null;

  function rollDice(token) {
    if (!/^\d*d\d+$/i.test(token)) return Number(token);
    const parts = token.toLowerCase().split("d");
    const count = parts[0] ? parseInt(parts[0]) || 1 : 1; // 如果没有数字，默认为1
    const faces = parseInt(parts[1]);
    
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += Math.floor(Math.random() * faces) + 1;
    }
    return sum;
  }

  const stack = tokens.map(t => /d/i.test(t) ? rollDice(t) : t);
  return Function("return " + stack.join(""))();
}
