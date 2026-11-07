// The 3D scene (src/3d/Scene.jsx) still imports its ui actions from here; they live in
// ui/uiSlice.js. Once the scene imports them from there (and dispatches previewBottomChanged
// instead of loadUiState), this file can go.
export {
  deselectBuildings,
  selectBuilding,
  tapBuilding,
  showQuickMessage,
  attackDenied,
  toggleBoardView,
  loadUiState,
} from "./uiSlice.js";
