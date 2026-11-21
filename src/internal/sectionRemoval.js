// Deleting a section, or moving it to another scene, also takes its
// descendants. A scene must keep at least one section.
export const wouldRemoveAllSections = (sections, sectionIds) => {
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
