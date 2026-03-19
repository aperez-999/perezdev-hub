import React, { useEffect, useState } from "react";
import { GRADIENTS } from "./theme.js";
import { Console } from "./console.js";

export function App(): React.ReactElement {
  const [grad, setGrad] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setGrad((g) => (g + 1) % GRADIENTS.length), 420);
    return () => clearInterval(t);
  }, []);
  return <Console gradient={GRADIENTS[grad]!} />;
}
