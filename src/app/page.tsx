"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [acceleration, setAcceleration] = useState({ x: 0, y: 0, z: 0 });
  const [permissionState, setPermissionState] = useState<
    "prompt" | "granted" | "unsupported"
  >("prompt");

  useEffect(() => {
    if (!("DeviceMotionEvent" in window)) {
      setPermissionState("unsupported");
      return;
    }

    const handler = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (acc) {
        setAcceleration({
          x: acc.x ?? 0,
          y: acc.y ?? 0,
          z: acc.z ?? 0,
        });
      }
    };

    window.addEventListener("devicemotion", handler);
    setPermissionState("granted");

    return () => window.removeEventListener("devicemotion", handler);
  }, []);

  const requestPermission = async () => {
    // iOS 13+ requires explicit permission request
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DME.requestPermission === "function") {
      const result = await DME.requestPermission();
      if (result === "granted") {
        setPermissionState("granted");
        // Re-trigger the effect by reloading
        window.location.reload();
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-8">
        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
          Device Acceleration
        </h1>

        {permissionState === "unsupported" && (
          <p className="text-red-500">
            DeviceMotion API is not supported on this device/browser.
          </p>
        )}

        {permissionState === "prompt" && (
          <button
            onClick={requestPermission}
            className="rounded-full bg-black px-6 py-3 text-white dark:bg-white dark:text-black"
          >
            Enable Motion Sensor
          </button>
        )}

        <div className="grid grid-cols-3 gap-6 text-center">
          {(["x", "y", "z"] as const).map((axis) => (
            <div
              key={axis}
              className="flex flex-col items-center rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800"
            >
              <span className="text-sm uppercase tracking-wider text-zinc-500">
                {axis}
              </span>
              <span className="mt-2 text-4xl font-mono font-bold text-black dark:text-white">
                {acceleration[axis].toFixed(2)}
              </span>
              <span className="text-xs text-zinc-400">m/s²</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
