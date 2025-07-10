export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  playingAudio: {
    title: '',
    fileId: undefined,
  },
  showAudioPlayer: false,
});

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
}

export const openAudioPlayer = (state, { fileId, fileName }) => {
  state.playingAudio.fileId = fileId;
  state.playingAudio.title = fileName;
  state.showAudioPlayer = true;
}

export const closeAudioPlayer = (state) => {
  state.showAudioPlayer = false;
  state.playingAudio = {
    title: '',
    fileId: undefined,
  };
}

export const toViewData = ({ state, props }) => {
  const selectedItemId = props.selectedItemId;

  // Apply collapsed state to flatGroups
  const flatGroups = (props.flatGroups || []).map(group => ({
    ...group,
    isCollapsed: state.collapsedIds.includes(group.id),
    children: state.collapsedIds.includes(group.id) ? [] : (group.children || []).map(item => ({
      ...item,
      selectedStyle: item.id === selectedItemId ?
        "outline: 2px solid var(--color-pr); outline-offset: 2px;" : ""
    }))
  }));

  return {
    flatGroups,
    playingAudio: state.playingAudio,
    showAudioPlayer: state.showAudioPlayer,
    selectedItemId: props.selectedItemId,
    uploadText: "Upload Audio",
    acceptedFileTypes: ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a']
  };
};