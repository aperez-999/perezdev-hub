import React, { useEffect, useState } from "react";
import { Console } from "./console.js";
import { Intro } from "./intro.js";
import { enterHubScreen, leaveHubScreen } from "./screen.js";

/** Skip the animated intro under test runners and non-interactive renders so
 *  the console (and its assertions) are available immediately. */
const SKIP_INTRO =
  !!process.env.VITEST || process.env.NODE_ENV === "test" || process.env.PDH_NO_INTRO === "1";

export function App(): React.ReactElement {
  const [ready, setReady] = useState(SKIP_INTRO);

  useEffect(() => {
    enterHubScreen();
    return () => leaveHubScreen();
  }, []);

  if (!ready) return <Intro onDone={() => setReady(true)} />;
  return <Console />;
}
