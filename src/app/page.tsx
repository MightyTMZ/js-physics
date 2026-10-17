"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [accelWithG, setAccelWithG] = useState({ x: 0, y: 0, z: 0 });
  const [accelWithoutG, setAccelWithoutG] = useState({ x: 0, y: 0, z: 0 });
  const [includeGravity, setIncludeGravity] = useState(true);
  const [permissionState, setPermissionState] = useState<
    "prompt" | "granted" | "unsupported"
  >("prompt");

  const acceleration = includeGravity ? accelWithG : accelWithoutG;

  const startListening = () => {
    const handler = (event: DeviceMotionEvent) => {
      const withG = event.accelerationIncludingGravity;
      const withoutG = event.acceleration;
      if (withG) {
        setAccelWithG({ x: withG.x ?? 0, y: withG.y ?? 0, z: withG.z ?? 0 });
      }
      if (withoutG) {
        setAccelWithoutG({ x: withoutG.x ?? 0, y: withoutG.y ?? 0, z: withoutG.z ?? 0 });
      }
    };

    window.addEventListener("devicemotion", handler);
    setPermissionState("granted");

    return () => window.removeEventListener("devicemotion", handler);
  };

  useEffect(() => {
    if (!("DeviceMotionEvent" in window)) {
      setPermissionState("unsupported");
      return;
    }

    // iOS 13+ requires a user gesture to request permission
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DME.requestPermission === "function") {
      // Stay in "prompt" state — user must tap the button
      return;
    }

    // Non-iOS: just start listening directly
    return startListening();
  }, []);

  const requestPermission = async () => {
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DME.requestPermission === "function") {
      try {
        const result = await DME.requestPermission();
        if (result === "granted") {
          startListening();
        } else {
          setPermissionState("unsupported");
        }
      } catch {
        setPermissionState("unsupported");
      }
    } else {
      // Non-iOS fallback
      startListening();
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-8">
        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
          Device Acceleration
        </h1>

        <button
          onClick={() => setIncludeGravity((v) => !v)}
          className="flex items-center gap-3 rounded-full border border-zinc-200 px-5 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <span
            className={`inline-block h-3 w-3 rounded-full ${
              includeGravity ? "bg-green-500" : "bg-zinc-400"
            }`}
          />
          {includeGravity ? "Including Gravity" : "Excluding Gravity"}
        </button>

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
