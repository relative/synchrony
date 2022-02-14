import {
  Node,
  BinaryOperator,
  BlockId,
  FunctionExpression,
  Program,
} from './util/types'

interface DecoderFunction {
  identifier: string
  offset: number
}

interface DecoderReference {
  identifier: string
  realIdentifier: string
  additionalOffset: number
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

  constructor(ast: Program) {
    this.ast = ast
  }
}
