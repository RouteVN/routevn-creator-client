import { next as Automerge  } from "@automerge/automerge"
import { nanoid } from 'nanoid'
import wasmUrl from "@automerge/automerge/automerge.wasm?url";

await Automerge.initializeWasm(wasmUrl)


// // console.log('doc4', doc4)
// // console.log('doc4 current snapshot:', JSON.stringify(doc4))

// // Or you can access the properties directly:
// // console.log('Current todos:', JSON.parse(JSON.stringify(Automerge.toJS(doc4))))

// // // Print the document history
// // console.log('Document History:');
// const history = Automerge.getHistory(doc4);
// history.forEach((state, i) => {
//   console.log(state.change)
  
//   // console.log(`${i + 1}. ${JSON.stringify(state.snapshot)}`);
// });

// // // Print all changes as patches (diff-like format)
// // console.log('\nChanges from doc1 to doc4:');
// // Automerge.getChanges(doc1, doc4).forEach((change, index) => {
// //   const patch = Automerge.decodeChange(change);
// //   console.log('patch', patch)
// // });


const createAutoMergeData = () => {
  let doc = Automerge.from({
    items: {},
    relationships: []
  })

  const toJSON = () => {
    const { items, relationships } = JSON.parse(JSON.stringify(Automerge.toJS(doc)))
    console.log({items, relationships})
    const processNode = (nodeId, items, relationships) => {
      const node = relationships.find(r => r.id === nodeId);
      if (!node) return null;
      
      return {
        ...items[nodeId],
        id: nodeId,
        children: node.children.map(childId => 
          processNode(childId, items, relationships)
        ).filter(Boolean)
      };
    };

    return relationships
      .filter(r => !relationships.some(other => 
        other.children.some(child => child === r.id)
      ))
      .map(root => processNode(root.id, items, relationships));
  }

  const toJSONFlat = () => {
    const items = []
    const processItem = (item) => {
      items.push(item);
      if (item.children) {
        item.children.forEach(child => processItem(child));
      }
    };
    toJSON().forEach(item => processItem(item));
    return items;
  }

  const createItem = (targetId, payload) => {
    doc = Automerge.change(doc, { message: 'createItem', time: Date.now() }, doc => {
      const id = nanoid();
      doc.items[id] = payload;
      if (targetId === '_root') {
        doc.relationships.push({
          id,
          children: []
        })
        // const foundItem = trasverseFind(doc.relationships)
        // foundItem.children.push({
        //   id,
        //   children: []
        // })
      }
    });
    return doc;
  }

  return {
    toJSON,
    toJSONFlat,
    createItem
  }
}

export {
  createAutoMergeData
}
