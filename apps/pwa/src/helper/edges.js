// The room controls keep from the screen's edges and the size of the round buttons, in pixels:
// the CSS variables of src/index.css (safe-area insets, vw and vh resolved by the browser), for
// what is placed from JavaScript, like the board preview of the 3D scene.
export const measureEdges = () => {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;" +
    "top:var(--edge-top);right:var(--edge-right);bottom:var(--edge-bottom);left:var(--edge-left);" +
    "padding-left:var(--fab);padding-top:var(--edge)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const px = (value) => parseFloat(value) || 0;
  const edges = {
    top: px(style.top),
    right: px(style.right),
    bottom: px(style.bottom),
    left: px(style.left),
    fab: px(style.paddingLeft),
    gap: px(style.paddingTop),
  };
  probe.remove();
  return edges;
};
