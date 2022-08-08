import React from "react";
import * as css from "./skin.less";

export default class ErrorBoundary extends React.Component<any, any> {
  constructor(props) {
    super(props);
    this.state = {error: null, errorInfo: null};
  }

  componentDidCatch(error, errorInfo) {
    // Catch errors in any components below and re-render with error message
    this.setState({
      error: error,
      errorInfo: errorInfo
    })
    // You can also log error messages to an error reporting service here
  }

  render() {
    if (this.state.errorInfo) {
      // Error path
      return (
        <div className={css.errorRT}>
          <div className={css.tt}>{this.props.title}</div>
          <div className={css.info}>
            {this.state.error && this.state.error.toString()}
          </div>
          <div className={css.stack}>
            {this.state.errorInfo.componentStack}
          </div>
        </div>
      );
    }
    // Normally, just render children
    return this.props.children;
  }
}