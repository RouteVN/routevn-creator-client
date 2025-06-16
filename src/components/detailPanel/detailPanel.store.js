export const INITIAL_STATE = Object.freeze({
  // No internal state needed - uses props
});

export const toViewData = ({ state, props }, payload) => {
  const hasContent = props.fields && props.fields.length > 0;
  const visibleFields = props.fields ? props.fields.filter(field => field.show !== false) : [];
  
  return {
    title: props.title || '',
    visibleFields,
    hasContent,
    emptyMessage: props.emptyMessage || 'No selection'
  };
};