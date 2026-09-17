import { distinctUntilChanged, map, startWith, switchMap, tap } from "rxjs";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { toFlatItems } from "../project/tree.js";

export const subscribeCharacterAvatarOptions = (
  deps,
  { onProjectStateChanged } = {},
) => {
  const { store, projectService, render, appService, i18n } = deps;
  const subscription = createProjectStateStream({ projectService })
    .pipe(
      tap(({ repositoryState }) => onProjectStateChanged?.(repositoryState)),
      map(({ repositoryState }) =>
        [
          ...new Set(
            toFlatItems(repositoryState.characters)
              .filter((item) => item.type === "character" && item.fileId)
              .map((item) => item.fileId),
          ),
        ].sort(),
      ),
      distinctUntilChanged(
        (previous, next) =>
          previous.length === next.length &&
          previous.every((fileId, index) => fileId === next[index]),
      ),
      switchMap((fileIds) =>
        projectService
          .observeFileUrls(fileIds)
          .pipe(startWith({ urls: {}, failedFileIds: [] })),
      ),
    )
    .subscribe(({ urls, failedFileIds }) => {
      store.setSpeakerAvatarUrls({ urls });
      render();
      if (failedFileIds.length > 0) {
        appService.showToast({
          message: i18n.charactersPage.failedLoadAvatarImages,
        });
      }
    });
  return () => subscription.unsubscribe();
};
