import React, { useEffect, useState } from "react";
import { loadRc } from "../core/rc.js";
import { Console } from "./console.js";
import { Intro } from "./intro.js";
import { Setup, type SetupLanding } from "./setup.js";
import { enterHubScreen, leaveHubScreen } from "./screen.js";

/** Skip intro and first-run setup under test runners and PDH_NO_INTRO. */
const SKIP_INTRO =
  !!process.env.VITEST || process.env.NODE_ENV === "test" || process.env.PDH_NO_INTRO === "1";

type Phase = "intro" | "setup" | "hub";

export function App(): React.ReactElement {
  const [phase, setPhase] = useState<Phase>(SKIP_INTRO ? "hub" : "intro");
  const [landing, setLanding] = useState<SetupLanding | null>(null);

  useEffect(() => {
    enterHubScreen();
    return () => leaveHubScreen();
  }, []);

  if (phase === "intro") {
    return (
      <Intro
        onDone={() => {
          void loadRc().then((rc) => setPhase(rc.setup_complete ? "hub" : "setup"));
        }}
      />
    );
  }
  if (phase === "setup") {
    return (
      <Setup
        onDone={(r) => {
          setLanding(r);
          setPhase("hub");
        }}
      />
    );
  }
  return <Console landing={landing} />;
}
