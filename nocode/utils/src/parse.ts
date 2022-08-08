// export function parse(pageData: { refs: any; frame: any; slot: any }) {
//   const refs = pageData.refs
//   const frame = pageData.frame
//   const slot = pageData.slot
//   const requireComs: string[] = []

//   function isObj(obj: any) {
//     return Object.prototype.toString.call(obj) === '[object Object]'
//   }

//   function isArray(ary: any) {
//     return Object.prototype.toString.call(ary) === '[object Array]'
//   }

//   function parseFrame(frame: any, {parent, key}: any) {
//     const r = refs[frame?.['_R_']]
//     if (r && (isObj(parent) || isArray(parent)) && typeof key !== 'undefined') {
//       parent[key] = r
//     } else {
//       if (isObj(frame)) {
//         Object.keys(frame).forEach((key, idx) => {
//           const newFrame = frame[key]
//           if (key === 'def') {
//             const key = newFrame.namespace + '@' + newFrame.version
//             if (requireComs.indexOf(key) < 0) {
//               requireComs.push(key)
//             }
//           }
//           if (isArray(newFrame)) {
//             newFrame.forEach((f: any, idx: any) => {
//               parseFrame(f, {parent: newFrame, key: idx})
//             })
//           } else if (isObj(newFrame)) {
//             parseFrame(newFrame, {parent: frame, key})
//           }
//         })
//       } else if (isArray(frame)) {
//         frame.forEach((f: any, idx: any) => {
//           parseFrame(f, {parent: frame, key: idx})
//         })
//       }
//     }
//   }

//   parseFrame(refs, {})

//   return {mainModule: {frame: refs[frame['_R_']], slot: refs[slot['_R_']]}, requireComs}
// }

export function parse(pageData: any) {
  const {mainModule, requireComs} = parseDumpJson(getRawDumpJson(pageData))

  const rstMainModule: any = {}

  if (mainModule.frames) {
    rstMainModule.frame = mainModule.frames.frames[0]
  }

  if (mainModule.slots) {
    rstMainModule.slot = mainModule.slots.slots[0]
  }

  return {
    mainModule: rstMainModule,
    requireComs
  }
}

function deepCopy<T>(obj: any, cache: Array<any> = []): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }


  const hit = cache.filter(i => i.original === obj)[0];

  if (hit) {
    return hit.copy;
  }


  const copy: any = Array.isArray(obj) ? [] : {};

  cache.push({
    original: obj,
    copy
  })

  Object.keys(obj).forEach(key => {
    copy[key] = deepCopy(obj[key], cache);
  })

  return copy;
}

function getRawDumpJson(dumpJson: any) {
  dumpJson = deepCopy(dumpJson);

  const {refs} = dumpJson;
  const usedFrameSlotKeyMap: any = {};

  function deep2(obj: any, count: number) {
    if (Array.isArray(obj)) {
      obj.forEach(obj => {
        deep2(obj, count)
      })
    } else if (Object.prototype.toString.call(obj) === '[object Object]') {
      Object.keys(obj).forEach(key => {
        if (key === 'id' || key === 'parentId') {
          obj[key] = `${count}_${obj[key]}`;
        } else if (refs[`${obj[key]}_topl`] && typeof obj[key] === 'string') {
          obj[key] = `${count}_${obj[key]}`
        } else {
          deep2(obj[key], count)
        }
      })
    }
  }

  function deep(refsKey: any, count: number) {
    if (!refsKey || refs[`${count}_${refsKey}`]) return

    const refsObj: any = deepCopy(refs[refsKey])

    if (!refsKey.endsWith('_content')) {
      refsObj.id = `${count}_${refsObj.id}`
    }

    refs[`${count}_${refsKey}`] = refsObj

    Object.keys(refsObj).forEach(key => {
      const value = refsObj[key];
      if (Array.isArray(value)) {
        value.forEach((v, index) => {
          if (!v['_R_']) {
            deep2(v, count)
          } else {
            deep(v['_R_'], count)
            value[index] = {_R_: `${count}_${v['_R_']}`}
          }
        })
      } else if (value['_R_']) {
        deep(value['_R_'], count)
        value['_R_'] = `${count}_${value['_R_']}`
      }
    })
  }

  Object.keys(refs).forEach(key => {
    const refsObj: any = refs[key];

    const {frames, slots} = refsObj;

    if (Array.isArray(frames)) {
      frames.forEach((frame, index) => {
        const refsKey = frame['_R_'];
        const count = usedFrameSlotKeyMap[refsKey];

        if (!count) {
          usedFrameSlotKeyMap[refsKey] = 1;
        } else {
          frames[index] = {_R_: `${count}_${refsKey}`}
          deep(refsKey, count)
        }
      })
    }


    if (Array.isArray(slots)) {
      slots.forEach((slot, index) => {
        const refsKey = slot['_R_'];
        const count = usedFrameSlotKeyMap[refsKey];

        if (!count) {
          usedFrameSlotKeyMap[refsKey] = 1;
        } else {
          slots[index] = {_R_: `${count}_${refsKey}`}
          deep(refsKey, count)
        }
      })
    }

  })

  return dumpJson;
}

function parseDumpJson(dumpJson: any) {
  dumpJson = deepCopy(dumpJson);

  const {refs} = dumpJson;
  const requireComs: string[] = [];
  const requireComsHash: any = {};

  Object.keys(refs).forEach(key => {
    const refsObj = refs[key];

    if (!key.endsWith('_rt')) {
      Object.keys(refsObj).forEach(key => {
        if (key === 'def') {
          const def = refsObj[key];
          const {version, namespace} = def;

          if (namespace && version) {
            const ns = `${namespace}@${version}`;
            if (!requireComsHash[ns]) {
              requireComsHash[ns] = 1;
              requireComs.push(ns);
            }

          }


          return;
        }


        const obj = refsObj[key];

        if (Array.isArray(obj)) {
          obj.forEach((item, index) => {
            const key = item['_R_'];
            if (key) {
              obj[index] = refs[key];
            }

          })
        } else if (obj && obj['_R_']) {
          refsObj[key] = refs[obj['_R_']];
        }
      })
    }

  });

  const mainModule: any = {}

  if (dumpJson['frames'] && dumpJson['frames']['_R_']) {
    mainModule.frames = refs[dumpJson['frames']['_R_']]
  }
  if (dumpJson['slots'] && dumpJson['slots']['_R_']) {
    mainModule.slots = refs[dumpJson['slots']['_R_']]
  }

  return {mainModule, requireComs};
}

