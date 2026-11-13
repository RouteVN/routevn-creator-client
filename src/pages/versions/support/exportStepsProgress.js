// Native exports show a list of steps in the progress dialog instead of one
// progress bar that starts over at each phase.

// Steps before the current one are done, and the steps after it have not
// started. The current step shows `detail`, when there is one.
export const createExportStepsView = ({ labels, steps, current, detail }) => {
  const currentIndex = steps.indexOf(current);
  return steps.map((step, index) => {
    const row = { label: labels[step], state: "pending" };
    if (index < currentIndex) row.state = "done";
    if (index === currentIndex) {
      row.state = "active";
      if (detail !== undefined) row.detail = detail;
    }
    return row;
  });
};

// Opens the progress dialog on the first step. `showStep` moves to a later
// step or updates the running step's detail; it never moves back.
export const openExportStepsProgress = ({
  appService,
  title,
  message,
  labels,
  steps,
}) => {
  let currentStep = steps[0];
  let currentDetail;
  const progressDialog = appService.showProgressDialog({
    message,
    title,
    steps: createExportStepsView({ labels, steps, current: currentStep }),
  });
  const showStep = (step, detail) => {
    const index = steps.indexOf(step);
    const currentIndex = steps.indexOf(currentStep);
    if (index < currentIndex) return;
    if (index === currentIndex && detail === currentDetail) return;
    currentStep = step;
    currentDetail = detail;
    progressDialog.update({
      steps: createExportStepsView({
        labels,
        steps,
        current: currentStep,
        detail: currentDetail,
      }),
    });
  };
  return { progressDialog, showStep };
};
