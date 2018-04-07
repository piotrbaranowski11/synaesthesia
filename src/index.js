import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Route, Switch } from "react-router-dom";
import "./index.css";
import { containers } from "./modules/App";

import registerServiceWorker from "./registerServiceWorker";
import { Provider } from "react-redux";
import store from "./store";

ReactDOM.render(
  <Provider store={store}>
    <Router>
      <Switch>
        <Route path={`${process.env.PUBLIC_URL}/:seed`} component={containers.AppContainer} />
        <Route path={`${process.env.PUBLIC_URL}/`} component={containers.AppContainer} />
      </Switch>
    </Router>
  </Provider>,
  document.getElementById("root")
);

registerServiceWorker();