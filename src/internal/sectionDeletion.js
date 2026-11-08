// A section deletion also removes its descendants.
export const wouldDeleteAllSections = (sections, sectionIds) => {
  const targets = new Set(sectionIds);
  const deleted = new Set();
  const visit = (nodes, deleting = false) => {
    for (const node of nodes ?? []) {
      const remove = deleting || targets.has(node.id);
      if (remove) deleted.add(node.id);
      visit(node.children, remove);
    }
  };
  visit(sections?.tree);
  const ids = Object.keys(sections?.items ?? {});
  return ids.length > 0 && ids.every((id) => deleted.has(id));
};
