import { useEffect, useState } from "react";
import { classifyDevice } from "@/utils/device.js";

// 서버 렌더에는 window 가 없다. 첫 렌더에서 null 을 돌려주고 마운트 후 측정한다.
// null 은 "아직 모른다"는 뜻이고, 호출부는 이를 로딩과 같이 다뤄야 한다 —
// pc 로 가정하면 좁은 창의 관리자가 한 프레임 동안 관리자 화면을 보게 된다.
export function useDeviceType() {
  const [device, setDevice] = useState(null);
  useEffect(() => {
    const read = () => setDevice(classifyDevice(window.innerWidth));
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return device;
}
