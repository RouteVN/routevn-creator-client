// The explorer panel of a tablet landscape page. Hiding it shrinks it to the
// button that shows it again.
const COLLAPSED_WIDTH = 48;
const DEFAULT_WIDTH = 300;

export const createInitialState = () => ({
  collapsed: false,
});

export const setCollapsed = ({ state }, { collapsed } = {}) => {
  state.collapsed = collapsed;
};

export const selectCollapsed = ({ state }) => state.collapsed;

export const selectViewData = ({ state, props, i18n }) => {
  const copy = i18n.tabletExplorerPanel;
  return {
    collapsed: state.collapsed,
    label: props.label ?? "",
    labelSize: props.labelSize ?? "md",
    panelWidth: state.collapsed ? COLLAPSED_WIDTH : (props.w ?? DEFAULT_WIDTH),
    toggleLabel: state.collapsed ? copy.showLabel : copy.hideLabel,
    // The explorer stays mounted while hidden, so it keeps its open folders
    // and scroll position.
    contentStyle: state.collapsed ? "display: none;" : "",
  };
};
