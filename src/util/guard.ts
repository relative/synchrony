import { Node as ENode } from 'estree'
import {
  Expression,
  Node as SNode,
  Literal,
  BooleanLiteral,
  NumericLiteral,
  StringLiteral,
  UnaryExpression,
  NumericUnaryExpression,
  Statement,
  ExpressionStatement,
  SequenceExpression,
  AssignmentExpression,
  ReturnStatement,
  VariableDeclaration,
  ArrayExpression,
  Pattern,
  Identifier,
  FunctionExpression,
  BlockStatement,
  PrivateIdentifier,
  Super,
  BinaryExpression,
  CallExpression,
  MemberExpression,
  IfStatement,
  ObjectExpression,
} from './types'

type Node = ENode | SNode

export function isPrivateIdentifier(node: Node): node is PrivateIdentifier {
  return node.type === 'PrivateIdentifier'
}

export function isLiteral(node: Node): node is Literal {
  return node.type === 'Literal'
}
export function isLiteralString(node: Node): node is StringLiteral {
  return isLiteral(node) && typeof node.value === 'string'
}

export function isLiteralNumeric(node: Node): node is NumericLiteral {
  return isLiteral(node) && typeof node.value === 'number'
}

export function isLiteralBoolean(node: Node): node is BooleanLiteral {
  return isLiteral(node) && typeof node.value === 'boolean'
}

export function isUnaryExpression(node: Node): node is UnaryExpression {
  return node.type === 'UnaryExpression'
}

export function isUnaryExpressionNumeric(
  node: Node
): node is NumericUnaryExpression {
  return isUnaryExpression(node) && isLiteralNumeric(node.argument)
}

export function isExpressionStatement(node: Node): node is ExpressionStatement {
  return node.type === 'ExpressionStatement'
}

export function isSequenceExpression(node: Node): node is SequenceExpression {
  return node.type === 'SequenceExpression'
}

export function isAssignmentExpression(
  node: Node
): node is AssignmentExpression {
  return node.type === 'AssignmentExpression'
}

export function isReturnStatement(node: Node): node is ReturnStatement {
  return node.type === 'ReturnStatement'
}

export function isVariableDeclaration(node: Node): node is VariableDeclaration {
  return node.type === 'VariableDeclaration'
}

export function isArrayExpression(node: Node): node is ArrayExpression {
  return node.type === 'ArrayExpression'
}

export function isIdentifier(node: Node): node is Identifier {
  return node.type === 'Identifier'
}

export function isFunctionExpression(node: Node): node is FunctionExpression {
  return node.type === 'FunctionExpression'
}

export function isCallExpression(node: Node): node is CallExpression {
  return node.type === 'CallExpression'
}

export function isBlockStatement(node: Node): node is BlockStatement {
  return node.type === 'BlockStatement'
}

export function isBinaryExpression(node: Node): node is BinaryExpression {
  return node.type === 'BinaryExpression'
}

export function isMemberExpression(node: Node): node is MemberExpression {
  return node.type === 'MemberExpression'
}

export function isIfStatement(node: Node): node is IfStatement {
  return node.type === 'IfStatement'
}

export function isObjectExpresesion(node: Node): node is ObjectExpression {
  return node.type === 'ObjectExpression'
}
