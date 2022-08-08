import {KEY_REF, PIN_KEYS} from "./constants";

export function parse(pageData) {
  const refs = pageData.refs
  const slots = getRef(refs, pageData.slots)
  const frame = getRef(refs, pageData.frame)

  const connectors = pageData.connectors
  const pluginDataset = pageData.pluginDataset

  const requireComs: string[] = []

  function parseFrame(frame) {
    const {comAry, model, def, parent} = frame

    PIN_KEYS.forEach(key => {
      const pins = frame[key]

      if (Array.isArray(pins)) {
        pins.forEach((pin, idx) => {
          const realPin = getRef(refs, pin) || pin

          if (realPin) {
            if (Array.isArray(realPin.conAry)) {
              realPin.conAry.forEach((con, idx) => {
                const realCon = getRef(refs, con)

                if (!realCon && !con.id) {
                  delete realPin.conAry[idx]
                }

                if (!realCon) return

                const {finishPin, startPin} = realCon
                const realFinishPin = getRef(refs, finishPin)
                const realStartPin = getRef(refs, startPin)

                if (realFinishPin) {
                  realCon.finishPin = realFinishPin
                }

                if (realStartPin) {
                  realCon.startPin = realStartPin
                }

                realPin.conAry[idx] = realCon
              })

              const conAry = realPin.conAry.filter(con => con)

              if (!conAry?.length) {
                delete realPin.conAry
              } else {
                realPin.conAry = conAry
              }
            }

            const realParent = getRef(refs, realPin.parent)

            if (realParent) {
              realPin.parent = realParent
            }

            frame[key][idx] = realPin
          }
        })
      }
    })

    if (model) {
      const realModel = getRef(refs, model)

      if (realModel) {
        parseFrame(realModel)
        frame.model = realModel
      }
    }

    if (def) {
      const key = def.namespace + '@' + def.version

      if (requireComs.indexOf(key) <= 0) {
        requireComs.push(key)
      }
    }

    if (parent) {
      const realParent = getRef(refs, parent)

      if (realParent) {
        frame.parent = realParent
      }
    }

    if (Array.isArray(comAry)) {
      comAry.forEach((com, idx) => {
        const realCom = getRef(refs, com) || com

        parseFrame(realCom)

        comAry[idx] = realCom
      })
    }
  }

  function parseSlot(slot) {
    const {comAry} = slot

    if (Array.isArray(comAry)) {
      comAry.forEach((com, idx) => {
        const realCom = getRef(refs, com)

        if (!realCom) return

        const {model, parent, slots} = realCom

        const realModel = getRef(refs, model)

        if (realModel) {
          com = realCom

          if (getRef(refs, realCom.model)) {
            realCom.model = getRef(refs, realCom.model)
          }
        }

        const realParent = getRef(refs, parent)

        if (realParent) {
          com.parent = realParent
        }

        if (Array.isArray(slots)) {
          slots.forEach((slot, idx) => {
            const realSlot = getRef(refs, slot)

            if (realSlot) {
              parseSlot(realSlot)
              slots[idx] = realSlot
            }
          })
        }

        comAry[idx] = com
      })
    }
  }

  function parseSlots(rslots) {
    const {slots} = rslots

    if (Array.isArray(slots)) {
      slots.forEach((slot, idx) => {
        const realSlot = getRef(refs, slot)

        if (realSlot) {
          parseSlot(realSlot)
          slots[idx] = realSlot
        }
      })
    }
  }

  parseFrame(frame)

  parseSlots(slots)

  return {mainModule: {frame, slots, pluginDataset, connectors}, requireComs}
}

function getRef(refs, obj) {
  const refKey = obj?.[KEY_REF]

  return refKey && refs?.[refKey]
}
