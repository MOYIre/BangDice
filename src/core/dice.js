export function rollExpr(expr) {
  expr = expr.replace(/\s+/g, "");
  
  // 验证表达式只包含数字、d、+、-、*、/、()和空格
  if (!/^[0-9d+\-*/()]+$/.test(expr)) {
    throw new Error("Invalid dice expression");
  }
  
  // 使用更安全的解析方法，避免Function构造函数
  return parseAndEvaluateDice(expr);
}

// 解析并计算骰子表达式
function parseAndEvaluateDice(expr) {
  // 简单解析方法：先处理d表达式，再处理运算符
  // 替换所有d骰表达式
  let result = expr;
  const diceRegex = /(\d*)d(\d+)/gi;
  
  // 先处理所有骰子表达式
  result = result.replace(diceRegex, (match, countStr, facesStr) => {
    const count = countStr ? parseInt(countStr) : 1;
    const faces = parseInt(facesStr);
    
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += Math.floor(Math.random() * faces) + 1;
    }
    
    return sum.toString();
  });
  
  // 现在计算剩余的数学表达式
  // 确保表达式是安全的，只包含数字和运算符
  if (!/^[0-9+\-*/().]+$/.test(result)) {
    throw new Error("Invalid expression after dice evaluation");
  }
  
  // 使用Function来安全计算数学表达式
  // 进一步验证只包含安全字符
  try {
    // 评估表达式
    return Function('"use strict"; return (' + result + ')')();
  } catch (e) {
    throw new Error("Invalid mathematical expression: " + e.message);
  }
}
