"use client";

import { useState, useEffect, useRef } from "react";

interface SensorData {
  attitude: { roll: number; pitch: number; yaw: number };
  gravity: { x: number; y: number; z: number };
  rotationRate: { x: number; y: number; z: number };
  userAcceleration: { x: number; y: number; z: number };
}

const INITIAL: SensorData = {
  attitude: { roll: 0, pitch: 0, yaw: 0 },
  gravity: { x: 0, y: 0, z: 0 },
  rotationRate: { x: 0, y: 0, z: 0 },
  userAcceleration: { x: 0, y: 0, z: 0 },
};

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export default function Home() {
  const [data, setData] = useState<SensorData>(INITIAL);
  const [permissionState, setPermissionState] = useState<
    "prompt" | "granted" | "unsupported"
  >("prompt");
  const [geoCoords, setGeoCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Use a ref to accumulate the latest readings, then flush to state once per second
  const latestRef = useRef<SensorData>({ ...INITIAL });

  const startListening = () => {
    // --- DeviceMotion: acceleration, gravity, rotation rate ---
    const motionHandler = (event: DeviceMotionEvent) => {
      const accel = event.acceleration;
      const accelG = event.accelerationIncludingGravity;
      const rot = event.rotationRate;

      if (accel) {
        latestRef.current.userAcceleration = {
          x: accel.x ?? 0,
          y: accel.y ?? 0,
          z: accel.z ?? 0,
        };
      }

      // Gravity = accelerationIncludingGravity - userAcceleration
      if (accelG && accel) {
        latestRef.current.gravity = {
          x: (accelG.x ?? 0) - (accel.x ?? 0),
          y: (accelG.y ?? 0) - (accel.y ?? 0),
          z: (accelG.z ?? 0) - (accel.z ?? 0),
        };
      }

      if (rot) {
        latestRef.current.rotationRate = {
          x: rot.alpha ?? 0,
          y: rot.beta ?? 0,
          z: rot.gamma ?? 0,
        };
      }
    };

    // --- DeviceOrientation: attitude (pitch, roll, yaw) ---
    const orientationHandler = (event: DeviceOrientationEvent) => {
      // beta = pitch (-180..180°), gamma = roll (-90..90°), alpha = yaw (0..360°)
      // Convert to radians to match the CSV format
      latestRef.current.attitude = {
        pitch: degToRad(event.beta ?? 0),
        roll: degToRad(event.gamma ?? 0),
        yaw: degToRad(event.alpha ?? 0),
      };
    };

    window.addEventListener("devicemotion", motionHandler);
    window.addEventListener("deviceorientation", orientationHandler);

    // Flush latest readings to React state once per second
    const intervalId = setInterval(() => {
      setData({ ...latestRef.current });
    }, 1000);

    setPermissionState("granted");

    return () => {
      window.removeEventListener("devicemotion", motionHandler);
      window.removeEventListener("deviceorientation", orientationHandler);
      clearInterval(intervalId);
    };
  };

  const startGeolocation = () => {
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation is not supported by this browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setGeoCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setGeoError(null);
      },
      (error) => {
        setGeoError(error.message);
      },
      { enableHighAccuracy: true, maximumAge: 1000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  };

  useEffect(() => {
    if (!("DeviceMotionEvent" in window)) {
      setPermissionState("unsupported");
      return;
    }

    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DME.requestPermission === "function") {
      return;
    }

    const cleanupMotion = startListening();
    const cleanupGeo = startGeolocation();
    return () => {
      cleanupMotion?.();
      cleanupGeo?.();
    };
  }, []);

  const requestPermission = async () => {
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    // Also request orientation permission on iOS
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };

    try {
      if (typeof DME.requestPermission === "function") {
        const motionResult = await DME.requestPermission();
        if (motionResult !== "granted") {
          setPermissionState("unsupported");
          return;
        }
      }
      if (typeof DOE.requestPermission === "function") {
        const orientResult = await DOE.requestPermission();
        if (orientResult !== "granted") {
          setPermissionState("unsupported");
          return;
        }
      }
      startListening();
      startGeolocation();
    } catch {
      setPermissionState("unsupported");
    }
  };

  const sections: {
    title: string;
    unit: string;
    keys: { label: string; value: number }[];
  }[] = [
    {
      title: "Attitude",
      unit: "rad",
      keys: [
        { label: "Roll", value: data.attitude.roll },
        { label: "Pitch", value: data.attitude.pitch },
        { label: "Yaw", value: data.attitude.yaw },
      ],
    },
    {
      title: "Gravity",
      unit: "m/s²",
      keys: [
        { label: "X", value: data.gravity.x },
        { label: "Y", value: data.gravity.y },
        { label: "Z", value: data.gravity.z },
      ],
    },
    {
      title: "Rotation Rate",
      unit: "°/s",
      keys: [
        { label: "X", value: data.rotationRate.x },
        { label: "Y", value: data.rotationRate.y },
        { label: "Z", value: data.rotationRate.z },
      ],
    },
    {
      title: "User Acceleration",
      unit: "m/s²",
      keys: [
        { label: "X", value: data.userAcceleration.x },
        { label: "Y", value: data.userAcceleration.y },
        { label: "Z", value: data.userAcceleration.z },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 py-10 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center gap-8 px-4">
        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
          Device Sensors
        </h1>

        {permissionState === "unsupported" && (
          <p className="text-red-500">
            Motion/Orientation API is not supported on this device/browser.
          </p>
        )}

        {permissionState === "prompt" && (
          <button
            onClick={requestPermission}
            className="rounded-full bg-black px-6 py-3 text-white dark:bg-white dark:text-black"
          >
            Enable Motion Sensors
          </button>
        )}

        {sections.map((section) => (
          <div key={section.title} className="w-full">
            <h2 className="mb-3 text-lg font-semibold text-black dark:text-zinc-50">
              {section.title}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {section.keys.map((k) => (
                <div
                  key={k.label}
                  className="flex flex-col items-center rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <span className="text-xs uppercase tracking-wider text-zinc-500">
                    {k.label}
                  </span>
                  <span className="mt-1 text-2xl font-mono font-bold text-black dark:text-white">
                    {k.value.toFixed(4)}
                  </span>
                  <span className="text-xs text-zinc-400">{section.unit}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Geolocation */}
        <div className="w-full">
          <h2 className="mb-3 text-lg font-semibold text-black dark:text-zinc-50">
            Geolocation
          </h2>

          {geoError && (
            <p className="text-red-500 text-sm mb-2">{geoError}</p>
          )}

          {geoCoords ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  Latitude
                </span>
                <span className="mt-1 text-xl font-mono font-bold text-black dark:text-white">
                  {geoCoords.latitude.toFixed(6)}
                </span>
                <span className="text-xs text-zinc-400">°</span>
              </div>
              <div className="flex flex-col items-center rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  Longitude
                </span>
                <span className="mt-1 text-xl font-mono font-bold text-black dark:text-white">
                  {geoCoords.longitude.toFixed(6)}
                </span>
                <span className="text-xs text-zinc-400">°</span>
              </div>
              <div className="col-span-2 flex flex-col items-center rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  Accuracy
                </span>
                <span className="mt-1 text-xl font-mono font-bold text-black dark:text-white">
                  ±{geoCoords.accuracy.toFixed(1)}
                </span>
                <span className="text-xs text-zinc-400">meters</span>
              </div>
            </div>
          ) : (
            !geoError && (
              <p className="text-sm text-zinc-400">
                Waiting for location data…
              </p>
            )
          )}
        </div>
      </main>
    </div>
  );
}
