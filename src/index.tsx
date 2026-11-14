import { render } from "@solidjs/web";
import App from "./App";
import { ensureCrossOriginIsolation } from "./lib/isolation";
import "./styles.css";

// On static hosts without COOP/COEP headers this registers the folder-local
// service worker and reloads once. On hosts that already send the headers it
// returns immediately.
void ensureCrossOriginIsolation();

render(() => <App />, document.getElementById("root")!);
