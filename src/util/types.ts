import * as ESTree from 'estree'

// this setprop func is really bad but typescript is also really bad so its okay
/**
 * Update properties on node
 * @param node AST node
 * @param props kv to update
 */
export function sp<T extends ESTree.Node>(
  node: ASTNode<any>,
  props: Partial<ASTNode<T>>
): node is ASTNode<T> {
  for (const key in props) {
    ;(node as any)[key] = props[key as keyof ASTNode<T>]
  }
  return true
}

export function getBlockId(node: BlockStatement): BlockId {
  return [node.start, node.end].join('!')
}

export type BlockId = string

export type NodeType = ESTree.Node['type']
export type NodeByType<T extends NodeType> = ASTNode<
  Extract<ESTree.Node, { type: T }>
>

// This does not seem to work on Union types (e.g. Node | undefined | null)
// or arrays. This should be fixed.

// ASTNode is expanded upon from github.com/RReverser (Ingvar Stepanyan)'s work
// at https://github.com/acornjs/acorn/issues/946#issuecomment-610074010
export type ASTNode<TType> = {
  [K in keyof TType]: TType[K] extends object ? ASTNode<TType[K]> : TType[K]
} & (TType extends ESTree.Node
  ? {
      start: number
      end: number
    }
  : {})

// .map(i=>{
//   a=i.split('.');
//   return `export type ${a[1]} = ASTNode<${a.join('.')}>`
// }).join('\n')
export type BinaryOperator = ESTree.BinaryOperator

export type Node = ASTNode<ESTree.Node>
export type Identifier = ASTNode<ESTree.Identifier>

export type Literal = ASTNode<ESTree.Literal>
export type SimpleLiteral = ASTNode<ESTree.SimpleLiteral>
export type RegExpLiteral = ASTNode<ESTree.RegExpLiteral>
export type BigIntLiteral = ASTNode<ESTree.BigIntLiteral>

export type Program = ASTNode<ESTree.Program>

export type Function = ASTNode<ESTree.Function>
export type FunctionDeclaration = ASTNode<ESTree.FunctionDeclaration>
export type FunctionExpression = ASTNode<ESTree.FunctionExpression>
export type ArrowFunctionExpression = ASTNode<ESTree.ArrowFunctionExpression>

export type SwitchCase = ASTNode<ESTree.SwitchCase>

export type CatchClause = ASTNode<ESTree.CatchClause>

export type VariableDeclarator = ASTNode<ESTree.VariableDeclarator>

export type Statement = ASTNode<ESTree.Statement>
export type ExpressionStatement = ASTNode<ESTree.ExpressionStatement>
export type BlockStatement = ASTNode<ESTree.BlockStatement>
export type StaticBlock = ASTNode<ESTree.StaticBlock>
export type EmptyStatement = ASTNode<ESTree.EmptyStatement>
export type DebuggerStatement = ASTNode<ESTree.DebuggerStatement>
export type WithStatement = ASTNode<ESTree.WithStatement>
export type ReturnStatement = ASTNode<ESTree.ReturnStatement>
export type LabeledStatement = ASTNode<ESTree.LabeledStatement>
export type BreakStatement = ASTNode<ESTree.BreakStatement>
export type ContinueStatement = ASTNode<ESTree.ContinueStatement>
export type IfStatement = ASTNode<ESTree.IfStatement>
export type SwitchStatement = ASTNode<ESTree.SwitchStatement>
export type ThrowStatement = ASTNode<ESTree.ThrowStatement>
export type TryStatement = ASTNode<ESTree.TryStatement>
export type WhileStatement = ASTNode<ESTree.WhileStatement>
export type DoWhileStatement = ASTNode<ESTree.DoWhileStatement>
export type ForStatement = ASTNode<ESTree.ForStatement>
export type ForInStatement = ASTNode<ESTree.ForInStatement>
export type ForOfStatement = ASTNode<ESTree.ForOfStatement>
export type VariableDeclaration = ASTNode<ESTree.VariableDeclaration>
export type ClassDeclaration = ASTNode<ESTree.ClassDeclaration>

export type Expression = ASTNode<ESTree.Expression>
export type ThisExpression = ASTNode<ESTree.ThisExpression>
export type ArrayExpression = ASTNode<ESTree.ArrayExpression>
export type ObjectExpression = ASTNode<ESTree.ObjectExpression>
export type YieldExpression = ASTNode<ESTree.YieldExpression>
export type UnaryExpression = ASTNode<ESTree.UnaryExpression>
export type UpdateExpression = ASTNode<ESTree.UpdateExpression>
export type BinaryExpression = ASTNode<ESTree.BinaryExpression>
export type AssignmentExpression = ASTNode<ESTree.AssignmentExpression>
export type LogicalExpression = ASTNode<ESTree.LogicalExpression>
export type MemberExpression = ASTNode<ESTree.MemberExpression>
export type ConditionalExpression = ASTNode<ESTree.ConditionalExpression>
export type SimpleCallExpression = ASTNode<ESTree.SimpleCallExpression>
export type NewExpression = ASTNode<ESTree.NewExpression>
export type SequenceExpression = ASTNode<ESTree.SequenceExpression>
export type TemplateLiteral = ASTNode<ESTree.TemplateLiteral>
export type TaggedTemplateExpression = ASTNode<ESTree.TaggedTemplateExpression>
export type ClassExpression = ASTNode<ESTree.ClassExpression>
export type MetaProperty = ASTNode<ESTree.MetaProperty>
export type AwaitExpression = ASTNode<ESTree.AwaitExpression>
export type ImportExpression = ASTNode<ESTree.ImportExpression>
export type ChainExpression = ASTNode<ESTree.ChainExpression>

export type PrivateIdentifier = ASTNode<ESTree.PrivateIdentifier>
export type Property = ASTNode<ESTree.Property>
export type PropertyDefinition = ASTNode<ESTree.PropertyDefinition>
export type AssignmentProperty = ASTNode<ESTree.AssignmentProperty>
export type Super = ASTNode<ESTree.Super>
export type TemplateElement = ASTNode<ESTree.TemplateElement>
export type SpreadElement = ASTNode<ESTree.SpreadElement>
export type ObjectPattern = ASTNode<ESTree.ObjectPattern>
export type ArrayPattern = ASTNode<ESTree.ArrayPattern>
export type RestElement = ASTNode<ESTree.RestElement>
export type AssignmentPattern = ASTNode<ESTree.AssignmentPattern>

export type ClassBody = ASTNode<ESTree.ClassBody>

export type MethodDefinition = ASTNode<ESTree.MethodDefinition>
export type ImportDeclaration = ASTNode<ESTree.ImportDeclaration>
export type ExportNamedDeclaration = ASTNode<ESTree.ExportNamedDeclaration>
export type ExportDefaultDeclaration = ASTNode<ESTree.ExportDefaultDeclaration>
export type ExportAllDeclaration = ASTNode<ESTree.ExportAllDeclaration>
export type ImportSpecifier = ASTNode<ESTree.ImportSpecifier>
export type ImportDefaultSpecifier = ASTNode<ESTree.ImportDefaultSpecifier>
export type ImportNamespaceSpecifier = ASTNode<ESTree.ImportNamespaceSpecifier>
export type ExportSpecifier = ASTNode<ESTree.ExportSpecifier>

export type Pattern = ASTNode<ESTree.Pattern>
export type CallExpression = ASTNode<ESTree.CallExpression>

// Custom typed nodes for typeguards
export type PropertyLiteral = Property & {
  key: Literal
}

export type StringLiteral = Literal & { value: string }
export type NumericLiteral = Literal & { value: number }
export type BooleanLiteral = Literal & { value: boolean }
export type NumericUnaryExpression = UnaryExpression & {
  argument: NumericLiteral
}
