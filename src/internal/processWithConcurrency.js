export const processWithConcurrency = async (
  items,
  worker,
  { concurrency = 1, stopOnError = false } = {},
) => {
  const itemList = Array.isArray(items) ? items : [];
  if (itemList.length === 0) {
    return [];
  }

  const results = Array.from({ length: itemList.length });
  const workerCount = Math.min(concurrency, itemList.length);
  let nextIndex = 0;
  let firstError;

  const runWorker = async () => {
    while (nextIndex < itemList.length) {
      if (stopOnError && firstError) {
        return;
      }

      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = await worker(itemList[index], index);
      } catch (error) {
        firstError = firstError ?? error;

        if (stopOnError) {
          return;
        }

        throw error;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  if (firstError) {
    throw firstError;
  }

  return results;
};
