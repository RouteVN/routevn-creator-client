
import { next as Automerge } from "@automerge/automerge"
import { nanoid } from "nanoid";

// let initialDoc  = Automerge.from({
//   x: {
//     hello: 'iiiiiiiiiiii',
//     fomo: 'iiiiiiiii'
//   }
// })

// // Create two different documents
// let doc1 = Automerge.change(Automerge.clone(initialDoc), (doc) => {
//   doc.x = {
//     // hello: 'xxxxxxx',
//     ciao: 'xxxxxxxxxxxxx'
//   };
//   // doc.x.hello = 'xxxxxxx'
//   // doc.x.ciao = 'xxxxxxxxxxxxx'
// });
// let doc2 = Automerge.change(Automerge.clone(initialDoc), (doc) => {
//   doc.x = {
//     // hello: 'yyyyyyyyyyy',
//     // ciao: 'yy',
//     hey: 'yyyyyy'
//   }
//   // doc.x.hello = 'yyyyyyyyyyy'
//   // doc.x.ciao = 'yy'
//   // doc.x.hey = 'yyyyyy'
// });
// doc1 = Automerge.merge(doc1, doc2);
// doc2 = Automerge.merge(doc2, doc1);
// // Now, we can't tell which value doc1.x and doc2.x are going to assume --
// // the choice is arbitrary, but deterministic and equal across both documents.
// // console.log(doc1 == doc2);

// console.log(JSON.parse(JSON.stringify(Automerge.toJS(doc1))))
// console.log(JSON.parse(JSON.stringify(Automerge.toJS(doc2))))

// // console.log('confclits', {
// //   conflict1: Automerge.getConflicts(doc1, "x"), // {'1@01234567': 1, '1@89abcdef': 2}
// //   conflict2: Automerge.getConflicts(doc2, "x"), // {'1@01234567': 1, '1@89abcdef': 2}
// // })

const stepsEditorAutomergeData = () => {
  let doc = Automerge.from({
      steps: [{
        id: 'kjalf31',
        presentation: {
          background: {
            backgroundId: 'file:f4xajkl2'
          }
        }
      }]
    })
  /**
   * example:
   * {
   *  steps: [
   *    {
   *      id: '1',
   *      presentationInstructions: {
   *      },
   *      systemInstructions: {
   *      }
   *    }
   *  ]
   * }
   * @param {*} index 
   */
  const addStep = (index) => {
    doc = Automerge.change(doc, (doc) => {
      doc.steps.push({
        id: nanoid(),
      })
    })
  }

  const toJSON = () => {
    return JSON.parse(JSON.stringify(Automerge.toJS(doc)))
  }

  // const moveStep = (id, index) => {
  //   doc = Automerge.change(doc, (doc) => {
  //     const step = doc.steps.find(step => step.id === id)
  //     doc.steps.splice(doc.steps.indexOf(step), 1)
  //     doc.steps.splice(index, 0, step)
  //   })
  // }

  return {
    addStep,
    toJSON
  }
}

export default stepsEditorAutomergeData;