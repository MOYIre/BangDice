export function rollExpr(expr) {
  expr = expr.replace(/\s+/g, "");
  let tokens = expr.match(/(\d+d\d+|\d+|[+\-*/()])/gi);
  if (!tokens) return null;

  function rollDice(token) {
    if (!/^\d+d\d+$/i.test(token)) return Number(token);
    const [count, faces] = token.toLowerCase().split("d").map(Number);
    let sum = 0;
    for (let i = 0; i < count; i++) sum += Math.floor(Math.random() * faces) + 1;
    return sum;
  }

  const stack = tokens.map(t => /d/i.test(t) ? rollDice(t) : t);
  return Function("return " + stack.join(""))();
}
