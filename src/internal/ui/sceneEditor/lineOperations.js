export const syncSceneEditorProjectState = (store, projectService) => {
  const repositoryState = projectService.getRepositoryState();
  const domainState = projectService.getDomainState();
  const revision = projectService.getRepositoryRevision();
  store.setRepositoryState({ repository: repositoryState });
  store.setDomainState({
    domainState,
  });
  store.setRepositoryRevision({ revision });
  return repositoryState;
};

export const findCharacterIdByShortcut = (repositoryState, shortcut) => {
  const normalizedShortcut = String(shortcut || "").trim();
  if (!normalizedShortcut) {
    return null;
  }

  const characters = repositoryState?.characters?.items || {};
  for (const [characterId, character] of Object.entries(characters)) {
    if (character?.type !== "character") {
      continue;
    }

    if (String(character?.shortcut || "").trim() === normalizedShortcut) {
      return characterId;
    }
  }

  return null;
};
