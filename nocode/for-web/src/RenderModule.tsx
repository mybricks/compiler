import React, {useMemo, useCallback} from "react";
import {clone, observable} from "@mybricks/rxui";
import RenderCom from "./RenderCom";
import ErrorBoundary from "./ErrorBoundary";
import {compile, createIO, I_Node, I_Pin, I_Runner} from "@mybricks/compiler-js";

import coreComLib from '@mybricks/comlib-core-runtime'

type T_LogItem = { catelog: string, content: string, isBaseType: boolean, focus: Function, blur: Function }


export default function RenderModule({
                                       module,
                                       comDefs,
                                       inputParams,
                                       inputs,
                                       outputs,
                                       env,
                                       runtimeCfg,
                                       logs,
                                       events,
                                       logger = () => {
                                       },
                                       createPortal = () => {
                                       },
                                       callConnector
                                     }: {
  module: { frame: {  }, slot: {  } },
  comDefs: { [nsAndVersion: string]: Function },
  inputParams?,
  inputs?: { [id: string]: (fn: Function) => void },
  outputs?: { [id: string]: Function },
  env: {
    // createPortal?: (children) => any,
  },
  runtimeCfg: {
    getUserToken: () => string
    getEnvType: () => string
    getEnvParam: (name: string) => any,
    [name: string]: any
  },
  logs: {
    info: (item: T_LogItem) => void,
    error: (item: T_LogItem) => void
  },
  events: any[],
  logger: () => void,
  createPortal: (com: any) => void
}) {
  const jsx = useMemo(() => {
    const coreLibDef = {}
    if (coreComLib && Array.isArray(coreComLib.comAray)) {
      coreComLib.comAray.forEach(com => {
        coreLibDef[com.namespace] = com
      })
    }

    const nComDefs = Object.assign({}, comDefs, coreLibDef)

    const RT_MAPS = {}

    const {frame:mainFrame, slot:mainSlot} = observable(module)

    const runner: I_Runner = compile(mainFrame, {
      // envVars,
      node(node: I_Node) {
        return {
          render(frames: {}, curScope) {
            const io = createIO(node, {
              output() {
                //igonreObservableBefore()//TODO 待测试
              }
            }, curScope)

            RT_MAPS[node.id] = {frames, io}

            const rtDef = node.def
            const rtType = rtDef.rtType

            if (rtType && rtType.match(/js/gi)) {//逻辑组件
              const rtCfg = Object.assign({
                // get curModule() {
                //   const module = node.parent.parent
                //   if (module) {
                //     const frame = node.parent
                //     const outPins = frame.outputPins
                //     const outputs = {}
                //
                //     outPins.forEach(pin => {
                //       outputs[pin.id] = (val, callback) => {
                //         pin?._exe(curScope, val, callback)
                //       }
                //     })
                //     return {
                //       outputs
                //     }
                //   }
                // }
              }, runtimeCfg)

              const ns = rtDef.namespace + '@' + rtDef.version

              const comRt = nComDefs[ns]
              if(comRt&&typeof comRt.runtime==='function'){
                comRt.runtime({
                  data: clone(node.model.data),
                  //data: node.model.isSingleton?node.model.data:clone(node.model.data),
                  inputs: io.inputs,
                  inputsCallable:io.inputsCallable,
                  _inputs:io._inputs,
                  outputs: io.outputs,
                  _outputs:io._outputs,
                  env: Object.assign({runtime: rtCfg}, env || {}),
                  logger: logger(node),
                  createPortal
                })
              } else {
                throw new Error(`未找到组件(${ns})`)
              }

              // if (comRt && typeof comRt === 'function') {
              //   comRt({
              //     data: clone(node.model.data),
              //     //data: node.model.isSingleton?node.model.data:clone(node.model.data),
              //     inputs: io.inputs,
              //     outputs: io.outputs,
              //     env: Object.assign({runtime: rtCfg}, env || {}),
              //     logger: logger(node),
              //     createPortal
              //   })
              // } else {
              //   throw new Error(`未找到组件(${ns})`)
              // }
            }

            return io
          }
        }
      }, pin(pin: I_Pin) {//处理Pin extension
        const comRT = pin.parent ? pin.parent : void 0

        return {
          exe(val: any, from, curScope) {
            if (pin.type.match(/^ext$/gi)) {
              if (pin.direction.match(/^input|inner-output$/gi)) {
                if (pin.hostId === 'show') {
                  pin.parent.model.style.display = 'block'
                } else if (pin.hostId === 'hide') {
                  pin.parent.model.style.display = 'none'
                }
              }

              return false
            }

            if (pin.direction.match(/^output|inner-input$/gi)) {
              if (comRT) {
                const evts = comRT.model?.outputEvents
                if (evts) {
                  const eAry = evts[pin.id]
                  if (eAry && Array.isArray(eAry)) {
                    const activeEvt = eAry.find(e => e.active)
                    if (activeEvt) {
                      if (activeEvt.type === 'none') {
                        return false
                      }
                      if (activeEvt.type === 'defined') {
                        return
                      }

                      if (Array.isArray(events)) {
                        const def = events.find(ce => {
                          if (ce.type === activeEvt.type) {
                            return ce
                          }
                        })
                        if (def && typeof def.exe === 'function') {
                          def.exe({options: activeEvt.options}, value)
                        }
                      }
                      return false
                    }
                  }
                }
              }
            }

            const strVal = typeof val === 'object' && val ?
              JSON.stringify(val) :
              String(val)

            if (comRT) {
              if (logs) {
                if (typeof logs.info === 'function') {
                  setTimeout(v => {
                    logs.info({
                        catelog: `程序运行 ${comRT.title} | ${pin.title} ${pin.direction == 'input' || pin.direction == 'inner-input' ? '传入' : '传出'}`,
                        content: strVal,
                        isBaseType: !val || typeof val !== 'object',
                        focus() {
                          comRT._focus = true
                        },
                        blur() {
                          comRT._focus = void 0
                        }
                      }
                    )
                  })
                }
              }
            }
          }
        }
      }
    } as any)

    runner.run()({
      inputParams,
      inputs,
      outputs
    })

    const jsx = []

    mainSlot.comAry.forEach((node) => {
      jsx.push(
        <ErrorBoundary key={node.id} title={`${node.title} 组件发生错误`}>
          <RenderCom node={node} comDefs={nComDefs} env={env} runtimeCfg={runtimeCfg} createPortal={createPortal}
                     logger={logger} rtMaps={RT_MAPS}/>
        </ErrorBoundary>
      )
    })
    return jsx
  }, [])

  return jsx
}

function getOutputEvent(node, pinId): { type, options } {
  const outEvts = node.model.outputEvents
  if (outEvts) {
    const eAry = outEvts[pinId]
    if (eAry) {
      return eAry.find(ev => ev.active)
    }
  }
}

function exeConfigedEvent(eventDesc, val, {cfgEvents}: { cfgEvents }) {
  if (Array.isArray(cfgEvents)) {
    const def = cfgEvents.find(ce => {
      if (ce.type === eventDesc.type) {
        return ce
      }
    })
    if (def && typeof def.exe === 'function') {
      def.exe({options: eventDesc.options}, val)
    }
  }
}

function exeDefinedFn(eventDesc, val, exeContext: { fns }) {
  const fnName = eventDesc.options.id
  const fn = exeContext.fns.find(fn => fn.name === fnName)

  if (typeof fn === 'function') {
    fn(val)
  }
}


