import { current } from "immer";

export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  playingAudio: {
    title: 'キズナミュージック♪',
    duration: 74,
    current: 0,
    isPlaying: false,
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
  state.playingAudio.title = fileName || 'Audio File';
  state.showAudioPlayer = true;
  console.log('Opening audio player for file:', fileId, 'with name:', state.playingAudio.title);
}

export const closeAudioPlayer = (state) => {
  state.showAudioPlayer = false;
  state.playingAudio = {
    title: '',
    duration: 0,
    current: 0,
    isPlaying: false,
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

  const convertSecondsToTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' + secs : secs}`;
  };

  return {
    flatGroups,
    playingAudio: {
      ...state.playingAudio,
      current: convertSecondsToTime(state.playingAudio.current),
      duration: convertSecondsToTime(state.playingAudio.duration),
    },
    showAudioPlayer: state.showAudioPlayer,
    selectedItemId: props.selectedItemId,
    uploadText: "Upload Audio",
    acceptedFileTypes: ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a']
  };
};