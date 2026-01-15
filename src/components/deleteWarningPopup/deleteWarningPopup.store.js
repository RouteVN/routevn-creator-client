export const createInitialState = () => ({});

export const selectViewData = ({ props }) => {
  const totalCount = (props.includeProps || []).reduce(
    (sum, prop) => sum + (prop.count || 0),
    0,
  );

  return {
    isOpen: props.isOpen || false,
    includeProps: props.includeProps || [],
    totalCount,
  };
};
