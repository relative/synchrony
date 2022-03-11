import {
  Node,
  BinaryOperator,
  BlockId,
  FunctionExpression,
  Program,
} from './util/types'
import { Transformer, TransformerOptions } from './transformers/transformer'

import * as eslintScope from 'eslint-scope'

import ControlFlow from './transformers/controlflow'
import Desequence from './transformers/desequence'
import LiteralMap from './transformers/literalmap'
import MemberExpressionCleaner from './transformers/memberexpressioncleaner'
import Simplify from './transformers/simplify'
import StringDecoder from './transformers/stringdecoder'
import DeadCode from './transformers/deadcode'

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
  aliases: string[]
  functions: ControlFlowFunction[]
  literals: ControlFlowLiteral[]
}

export default class Context {
  ast: Program
  source?: string

  stringArray: string[] = []
  stringArrayIdentifier?: string
  stringDecoders: DecoderFunction[] = []
  stringDecoderReferences: DecoderReference[] = []

  controlFlowStorageNodes: {
    [x: BlockId]: ControlFlowStorage
  } = {}

  removeGarbage: boolean = true
  transformers: InstanceType<typeof Transformer>[]

  enableLog: boolean = true

  scopeManager: eslintScope.ScopeManager

  constructor(
    ast: Program,
    transformers: [string, Partial<TransformerOptions>][],
    source?: string
  ) {
    this.ast = ast
    this.transformers = this.buildTransformerList(transformers)

    this.source = source

    this.scopeManager = eslintScope.analyze(this.ast, {})
  }

  public log(message?: any, ...optionalParams: any[]) {
    if (!this.enableLog) return
    console.log(message, ...optionalParams)
  }

  private buildTransformerList(
    list: [string, Partial<TransformerOptions>][]
  ): InstanceType<typeof Transformer>[] {
    let transformers: InstanceType<typeof Transformer>[] = []
    for (let [name, opt] of list) {
      switch (name.toLowerCase()) {
        case 'controlflow':
          transformers.push(new ControlFlow(opt))
          break
        case 'desequence':
          transformers.push(new Desequence(opt))
          break
        case 'literalmap':
          transformers.push(new LiteralMap(opt))
          break
        case 'memberexpressioncleaner':
          transformers.push(new MemberExpressionCleaner(opt))
          break
        case 'simplify':
          transformers.push(new Simplify(opt))
          break
        case 'stringdecoder':
          transformers.push(new StringDecoder(opt))
          break
        case 'deadcode':
          transformers.push(new DeadCode(opt))
          break
        default:
          throw new TypeError(
            `Transformer "${name}" is invalid, it does not exist`
          )
      }
    }
    return transformers
  }
}
