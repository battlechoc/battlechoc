// React 19 ignores defaultProps on function components, so resolve them the way React did
const withDefaultProps = (props, defaultProps) => {
  const resolvedProps = { ...props };
  for (const [name, value] of Object.entries(defaultProps)) {
    if (resolvedProps[name] === undefined) {
      resolvedProps[name] = value;
    }
  }
  return resolvedProps;
};

export default withDefaultProps;
