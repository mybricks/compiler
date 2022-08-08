import React, {useMemo, useCallback} from "react";
import {clone, observable} from "@mybricks/rxui";
import RenderCom from "./RenderCom";
import ErrorBoundary from "./ErrorBoundary";

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
  module: { frame: { comAry }, slots: { slots } },
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
  const {obsModule, RT_MAPS, exeContext} = useMemo(() => {
    const obsModule = observable(module)

    const frame = obsModule.frame
    const fns = []

    function getEnvRuntime() {
      return Object.assign({
        debug: {},
        runtime: {},
        callConnector(name) {
          return callConnector(name)
        }
      }, env || {})
    }

    try {
      const _ScriptModule = {
        set export(fn) {
          fns.push(fn)
        }
      }

      const _searchCom = (selector) => {
        if (selector.match(/^#\w/gi)) {
          const refId = selector.substring(1)

          const com = exeContext.getComByRefId(refId)
          if (com) {
            return new Proxy({}, {
              get(target: {}, id: string, receiver: any): any {
                return (val) => {
                  if (id === 'hide') {
                    com.model.style.display = 'none'
                  } else {
                    const reg = exeContext.inputRegs[refId]
                    if (reg) {
                      const fnn = reg[id]
                      if (typeof fnn === 'function') {
                        fnn(val)
                      }
                    }
                  }
                }
              }
            })
          }
        } else {
          const comDef = comDefs[selector]
          if (comDef) {
            const runtime = comDef.runtime
            const inputRegs = {}, promiseRegs = {}

            const inputs = new Proxy({}, {
              get(target: {}, id: string, receiver: any): any {
                return (fn) => {
                  inputRegs[id] = fn
                }
              }
            })

            const outputs = new Proxy({}, {
              get(target: {}, id: string, receiver: any): any {
                return (val) => {
                  const resolve = promiseRegs[id]
                  if (typeof resolve === 'function') {
                    resolve(val)
                  }
                }
              }
            })

            runtime({
              data: {},
              //configs,
              inputs,
              outputs,
              env: getEnvRuntime(),
              isAutoRun() {
                return false
              },
              logger: {
                trace(msg, catelog) {
                  logger.info(comDef.title + (catelog ? `-${catelog}` : ''), msg)
                },
                info(msg, catelog) {
                  logger.info(comDef.title + (catelog ? `-${catelog}` : ''), msg)
                },
                warn(msg, catelog) {
                  logger.warn(comDef.title + (catelog ? `-${catelog}` : ''), msg)
                },
                error(msg, catelog) {
                  logger.error(comDef.title + (catelog ? `-${catelog}` : ''), msg)
                }
              },
            })

            return new Proxy({}, {
              get(target: {}, id: string, receiver: any): any {
                return (params) => {
                  const fn = inputRegs[id]
                  if (typeof fn === 'function') {
                    fn(params)

                    const rels = comDef.inputs.find(ipt => ipt.id === id).rels
                    if (Array.isArray(rels)) {
                      const rtn = new Proxy({}, {
                        get(target: {}, outId: string, receiver: any): any {
                          const refOutput = rels.find(nid => outId === nid)
                          if (refOutput) {
                            return (fn) => {
                              promiseRegs[outId] = fn

                              return rtn
                            }
                          }
                        }
                      })
                      return rtn
                    }
                  }
                }
              }
            })
          }
        }
      }

      const script = `
    function $(selector){
      if(typeof selector=='string'){
        return _searchCom(selector)
      }
    }
    
    ${frame.script}
    `
      //try {
      eval(script.replace(/export\s*/gi, `_ScriptModule.export= `))

      const onPageLoad = fns.find(fn => fn.name === 'onPageLoad')
      if (onPageLoad) {
        onPageLoad()
      }

    } catch (ex) {
      console.error(ex)
    }


    const exeContext = {
      inputRegs: {},
      fns,
      getComByRefId(refId: string) {
        return frame.comAry.find(com => com.refId === refId)
      }
    }

    return {obsModule, RT_MAPS: {}, exeContext}
  }, [])

  const init = useCallback(slot => {
    if (slot.comAry) {
      slot.comAry.forEach(node => {
        RT_MAPS[node.id] = {
          io: {
            inputs: new Proxy({}, {
              get(target: {}, id: string, receiver: any): any {
                return (fn) => {
                  let reg = exeContext.inputRegs[node.refId]
                  if (!reg) {
                    reg = exeContext.inputRegs[node.refId] = {}
                  }
                  reg[id] = fn
                }
              }
            }),
            outputs: new Proxy({}, {
              get(target: {}, id: string, receiver: any): any {
                return (val) => {
                  const desc = getOutputEvent(node, id)
                  if (desc) {
                    if (desc.type === 'defined') {
                      exeDefinedFn(desc, val, exeContext)
                    } else {
                      exeConfigedEvent(desc, val, {cfgEvents: {}})
                    }
                  }
                }
              }
            })
          }
        }

        if (node.slots) {
          node.slots.forEach(slot => {
            init(slot)
          })
        }
      })
    }
  }, [])

  const jsx = useMemo(() => {
    const nComDefs = Object.assign({}, comDefs)

    const mainSlot = obsModule.slots.slots[0]

    init(mainSlot)

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


