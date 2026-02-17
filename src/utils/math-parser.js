/**
 * @file 安全的数学表达式解析器
 * 使用调度场算法和后缀表达式计算替代Function构造器，防止代码注入
 * 支持基本的数学运算：+、-、*、/、%、括号
 */

// 定义支持的操作符优先级
const OPERATORS = {
  '+': { precedence: 1, associativity: 'left' },
  '-': { precedence: 1, associativity: 'left' },
  '*': { precedence: 2, associativity: 'left' },
  '/': { precedence: 2, associativity: 'left' },
  '%': { precedence: 2, associativity: 'left' },
};

/**
 * 将中缀表达式转换为后缀表达式（调度场算法）
 * @param {string} expression - 数学表达式
 * @returns {Array} - 后缀表达式数组
 */
function infixToPostfix(expression) {
  const output = [];
  const operatorStack = [];
  const tokens = tokenize(expression);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (isNumber(token)) {
      output.push(parseFloat(token));
    } else if (token === '(') {
      operatorStack.push(token);
    } else if (token === ')') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
        output.push(operatorStack.pop());
      }
      operatorStack.pop(); // 移除 '('
    } else if (isOperator(token)) {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1] !== '(' &&
        isOperator(operatorStack[operatorStack.length - 1]) &&
        (
          (OPERATORS[operatorStack[operatorStack.length - 1]].associativity === 'left' &&
           OPERATORS[operatorStack[operatorStack.length - 1]].precedence >= OPERATORS[token].precedence) ||
          (OPERATORS[operatorStack[operatorStack.length - 1]].associativity === 'right' &&
           OPERATORS[operatorStack[operatorStack.length - 1]].precedence > OPERATORS[token].precedence)
        )
      ) {
        output.push(operatorStack.pop());
      }
      operatorStack.push(token);
    }
  }

  while (operatorStack.length > 0) {
    output.push(operatorStack.pop());
  }

  return output;
}

/**
 * 计算后缀表达式的值
 * @param {Array} postfix - 后缀表达式数组
 * @returns {number} - 计算结果
 */
function evaluatePostfix(postfix) {
  const stack = [];

  for (let i = 0; i < postfix.length; i++) {
    const token = postfix[i];

    if (typeof token === 'number') {
      stack.push(token);
    } else if (isOperator(token)) {
      if (stack.length < 2) {
        throw new Error('Invalid expression: insufficient operands for operator ' + token);
      }

      const b = stack.pop();
      const a = stack.pop();
      let result;

      switch (token) {
        case '+':
          result = a + b;
          break;
        case '-':
          result = a - b;
          break;
        case '*':
          result = a * b;
          break;
        case '/':
          if (b === 0) {
            throw new Error('Division by zero');
          }
          result = a / b;
          break;
        case '%':
          if (b === 0) {
            throw new Error('Modulo by zero');
          }
          result = a % b;
          break;
        default:
          throw new Error('Unknown operator: ' + token);
      }

      stack.push(result);
    }
  }

  if (stack.length !== 1) {
    throw new Error('Invalid expression: too many operands');
  }

  return stack[0];
}

/**
 * 将表达式分解为标记
 * @param {string} expression - 数学表达式
 * @returns {Array} - 标记数组
 */
function tokenize(expression) {
  const tokens = [];
  let currentNumber = '';

  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];

    if (isDigit(char) || char === '.') {
      currentNumber += char;
    } else {
      if (currentNumber !== '') {
        tokens.push(currentNumber);
        currentNumber = '';
      }

      if (char !== ' ') {
        tokens.push(char);
      }
    }
  }

  if (currentNumber !== '') {
    tokens.push(currentNumber);
  }

  return tokens;
}

/**
 * 检查字符是否为数字
 * @param {string} char - 字符
 * @returns {boolean} - 是否为数字
 */
function isDigit(char) {
  return /[0-9]/.test(char);
}

/**
 * 检查字符串是否为数字
 * @param {string} token - 标记
 * @returns {boolean} - 是否为数字
 */
function isNumber(token) {
  return !isNaN(parseFloat(token)) && isFinite(token);
}

/**
 * 检查字符串是否为操作符
 * @param {string} token - 标记
 * @returns {boolean} - 是否为操作符
 */
function isOperator(token) {
  return OPERATORS.hasOwnProperty(token);
}

/**
 * 安全计算数学表达式
 * @param {string} expression - 数学表达式
 * @returns {number} - 计算结果
 */
export function safeEvalMath(expression) {
  // 验证表达式只包含数字、运算符和括号
  if (!/^[0-9+\-*/().]+$/.test(expression)) {
    throw new Error('Invalid expression: contains unsupported characters');
  }

  const postfix = infixToPostfix(expression);
  return evaluatePostfix(postfix);
}