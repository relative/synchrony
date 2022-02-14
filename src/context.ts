import {
  Node,
  BinaryOperator,
  BlockId,
  FunctionExpression,
  Program,
} from './util/types'

export enum DecoderFunctionType {
  SIMPLE,
  BASE64,
  RC4,
}

export interface DecoderFunction {
  identifier: string
  type: DecoderFunctionType
  offset: number
  indexArgument: number
  keyArgument: number
}

export interface DecoderFunctionSimple extends DecoderFunction {
  type: DecoderFunctionType.SIMPLE
}

export interface DecoderFunctionBase64 extends DecoderFunction {
  type: DecoderFunctionType.BASE64
  charset: string
}

export interface DecoderFunctionRC4 extends DecoderFunction {
  type: DecoderFunctionType.RC4
  charset: string
}

export interface DecoderReference {
  identifier: string
  realIdentifier: string
  additionalOffset: number

  // if the wrapper is a function
  indexArgument?: number
  keyArgument?: number
}

interface ControlFlowFunction {
  identifier: string
  node: FunctionExpression
}
interface ControlFlowLiteral {
  identifier: string
  value: string | number
}
interface ControlFlowStorage {
  identifier: string
  functions: ControlFlowFunction[]
  literals: ControlFlowLiteral[]
}

export default class Context {
  ast: Program

  stringArray: string[] = []
  stringArrayIdentifier?: string
  stringDecoders: DecoderFunction[] = []
  stringDecoderReferences: DecoderReference[] = []

  controlFlowStorageNodes: {
    [x: BlockId]: ControlFlowStorage
  } = {}

  removeGarbage: boolean = true

  constructor(ast: Program) {
    this.ast = ast
  }
}
