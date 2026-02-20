import { safeEvalMath } from '../utils/math-parser.js';

export function rollExpr(expr) {
  expr = expr.replace(/\s+/g, "");
  
  // 验证表达式只包含数字、d、+、-、*、/、()和空格
  if (!/^[0-9d+\-*/()]+$/.test(expr)) {
    throw new Error("Invalid dice expression");
  }
  
  return parseAndEvaluateDice(expr);
}

// 解析并计算骰子表达式
function parseAndEvaluateDice(expr) {
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
  
  // 使用安全的数学解析器计算表达式（调度场算法）
  try {
    return safeEvalMath(result);
  } catch (e) {
    throw new Error("Invalid mathematical expression: " + e.message);
  }
}
