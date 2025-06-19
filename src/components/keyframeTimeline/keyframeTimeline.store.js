export const INITIAL_STATE = Object.freeze({
  // No internal state needed - uses props
});

export const toViewData = ({ state, props }, payload) => {
  // For now, hardcode the data - we'll add props later
  const totalDuration = props.totalDuration || '4s';
  
  // Hardcoded tracks data for now
  const tracks = props.tracks || [
    {
      name: 'Alpha',
      keyframes: [
        { start: 0, duration: 1 },
        { start: 2, duration: 1 }
      ]
    },
    {
      name: 'Scale',
      keyframes: [
        { start: 1, duration: 2 }
      ]
    }
  ];
  
  return {
    totalDuration,
    tracks
  };
};