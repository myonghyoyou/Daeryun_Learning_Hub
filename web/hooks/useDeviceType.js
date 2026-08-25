import { useEffect, useState } from "react";
import { classifyDevice } from "@/utils/device.js";

export function useDeviceType() {
  const [device, setDevice] = useState(() => classifyDevice(window.innerWidth));

  useEffect(() => {
    function handleResize() {
      setDevice(classifyDevice(window.innerWidth));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return device;
}
