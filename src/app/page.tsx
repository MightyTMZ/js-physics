"use client";

<<<<<<< HEAD
import { useState, useEffect, useRef, useCallback } from "react";
import * as ort from "onnxruntime-web";

// ---- types ----------------------------------------------------------------

interface SensorData {
  attitude: { roll: number; pitch: number; yaw: number };
  gravity: { x: number; y: number; z: number };
  rotationRate: { x: number; y: number; z: number };
  userAcceleration: { x: number; y: number; z: number };
}

interface Prediction {
  label: string;
  probabilities: Record<string, number>;
}

const INITIAL: SensorData = {
  attitude: { roll: 0, pitch: 0, yaw: 0 },
  gravity: { x: 0, y: 0, z: 0 },
  rotationRate: { x: 0, y: 0, z: 0 },
  userAcceleration: { x: 0, y: 0, z: 0 },
};

const LABELS = [
  "downstairs",
  "jogging",
  "sitting",
  "standing",
  "upstairs",
  "walking",
];

const WINDOW_SIZE = 6; // 6 timesteps (1 per second)
const INFERENCE_INTERVAL = 5000; // run inference every 5 s

// ---- helpers ---------------------------------------------------------------

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}
=======
import { useState, useEffect } from "react";
>>>>>>> parent of ddc28a5 (12 features for device calculation)

/** Convert a SensorData snapshot into a flat 12-element array matching the
 *  CSV column order: attitude.roll, attitude.pitch, attitude.yaw, gravity.x,
 *  gravity.y, gravity.z, rotationRate.x, rotationRate.y, rotationRate.z,
 *  userAcceleration.x, userAcceleration.y, userAcceleration.z */
function sensorToRow(d: SensorData): number[] {
  return [
    d.attitude.roll,
    d.attitude.pitch,
    d.attitude.yaw,
    d.gravity.x,
    d.gravity.y,
    d.gravity.z,
    d.rotationRate.x,
    d.rotationRate.y,
    d.rotationRate.z,
    d.userAcceleration.x,
    d.userAcceleration.y,
    d.userAcceleration.z,
  ];
}

// ---- component -------------------------------------------------------------

export default function Home() {
  const [accelWithG, setAccelWithG] = useState({ x: 0, y: 0, z: 0 });
  const [accelWithoutG, setAccelWithoutG] = useState({ x: 0, y: 0, z: 0 });
  const [includeGravity, setIncludeGravity] = useState(true);
  const [permissionState, setPermissionState] = useState<
    "prompt" | "granted" | "unsupported"
  >("prompt");
  const [geoCoords, setGeoCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);

<<<<<<< HEAD
  // Accumulate latest raw reading (high-frequency sensor events)
  const latestRef = useRef<SensorData>({ ...INITIAL });
  // Sliding window: most recent 6 one-second snapshots
  const bufferRef = useRef<number[][]>([]);
  // ONNX session
  const sessionRef = useRef<ort.InferenceSession | null>(null);

  // ---- load ONNX model once ------------------------------------------------

  useEffect(() => {
    ort.env.wasm.wasmPaths = "/";

    ort.InferenceSession.create("/model.onnx").then((session) => {
      sessionRef.current = session;
      console.log("ONNX model loaded");
    });
  }, []);

  // ---- inference ------------------------------------------------------------

  const runInference = useCallback(async () => {
    const session = sessionRef.current;
    const buf = bufferRef.current;
    if (!session || buf.length < WINDOW_SIZE) return;

    // Take the latest WINDOW_SIZE rows and flatten → 1×72
    const window = buf.slice(-WINDOW_SIZE);
    const flat = new Float32Array(window.flat());
    const tensor = new ort.Tensor("float32", flat, [1, 72]);

    const results = await session.run({ features: tensor });

    const label = results["output_label"].data[0] as string;

    // output_probability is a sequence of maps — onnxruntime-web gives us a
    // Map or plain object per sample
    const probMap = results["output_probability"].data[0] as unknown as Map<
      string,
      number
    >;
    const probabilities: Record<string, number> = {};
    if (probMap instanceof Map) {
      probMap.forEach((v, k) => {
        probabilities[k] = Math.round(v * 10000) / 10000;
      });
    } else {
      // fallback if it's a plain object
      for (const k of LABELS) {
        probabilities[k] = (probMap as Record<string, number>)[k] ?? 0;
      }
    }

    setPrediction({ label, probabilities });
  }, []);

  // ---- sensor listeners -----------------------------------------------------

  const startListening = useCallback(() => {
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

    const orientationHandler = (event: DeviceOrientationEvent) => {
      latestRef.current.attitude = {
        pitch: degToRad(event.beta ?? 0),
        roll: degToRad(event.gamma ?? 0),
        yaw: degToRad(event.alpha ?? 0),
      };
    };

    window.addEventListener("devicemotion", motionHandler);
    window.addEventListener("deviceorientation", orientationHandler);

    // Every 1 s: flush to React state & push into sliding-window buffer
    const sampleId = setInterval(() => {
      const snapshot = { ...latestRef.current };
      setData(snapshot);
      bufferRef.current.push(sensorToRow(snapshot));
      // Keep only the latest WINDOW_SIZE rows
      if (bufferRef.current.length > WINDOW_SIZE) {
        bufferRef.current = bufferRef.current.slice(-WINDOW_SIZE);
      }
    }, 1000);

    // Every 5 s: run inference
    const inferenceId = setInterval(() => {
      runInference();
    }, INFERENCE_INTERVAL);

    setPermissionState("granted");

    return () => {
      window.removeEventListener("devicemotion", motionHandler);
      window.removeEventListener("deviceorientation", orientationHandler);
      clearInterval(sampleId);
      clearInterval(inferenceId);
    };
  }, [runInference]);

  // ---- geolocation ----------------------------------------------------------
=======
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
>>>>>>> parent of ddc28a5 (12 features for device calculation)

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
      (error) => setGeoError(error.message),
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  };

  // ---- permissions / init ---------------------------------------------------

  useEffect(() => {
    if (!("DeviceMotionEvent" in window)) {
      setPermissionState("unsupported");
      return;
    }
<<<<<<< HEAD
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DME.requestPermission === "function") return;
=======

    // iOS 13+ requires a user gesture to request permission
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DME.requestPermission === "function") {
      // Stay in "prompt" state — user must tap the button
      return;
    }
>>>>>>> parent of ddc28a5 (12 features for device calculation)

    // Non-iOS: just start listening directly
    const cleanupMotion = startListening();
    const cleanupGeo = startGeolocation();
    return () => {
      cleanupMotion?.();
      cleanupGeo?.();
    };
  }, [startListening]);

  const requestPermission = async () => {
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
<<<<<<< HEAD
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (typeof DME.requestPermission === "function") {
        const r = await DME.requestPermission();
        if (r !== "granted") {
          setPermissionState("unsupported");
          return;
        }
      }
      if (typeof DOE.requestPermission === "function") {
        const r = await DOE.requestPermission();
        if (r !== "granted") {
          setPermissionState("unsupported");
          return;
=======
    if (typeof DME.requestPermission === "function") {
      try {
        const result = await DME.requestPermission();
        if (result === "granted") {
          startListening();
          startGeolocation();
        } else {
          setPermissionState("unsupported");
>>>>>>> parent of ddc28a5 (12 features for device calculation)
        }
      } catch {
        setPermissionState("unsupported");
      }
    } else {
      // Non-iOS fallback
      startListening();
      startGeolocation();
    }
  };

<<<<<<< HEAD
  // ---- UI data --------------------------------------------------------------

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

=======
>>>>>>> parent of ddc28a5 (12 features for device calculation)
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

<<<<<<< HEAD
        {/* Prediction */}
        <div className="w-full rounded-2xl border-2 border-indigo-500 bg-indigo-50 p-5 dark:bg-indigo-950">
          <h2 className="mb-2 text-lg font-semibold text-indigo-900 dark:text-indigo-100">
            Activity Prediction
          </h2>
          {prediction ? (
            <>
              <p className="text-3xl font-bold capitalize text-indigo-700 dark:text-indigo-300">
                {prediction.label}
              </p>
              <div className="mt-3 space-y-1">
                {LABELS.map((l) => (
                  <div key={l} className="flex items-center gap-2 text-sm">
                    <span className="w-24 capitalize text-indigo-800 dark:text-indigo-200">
                      {l}
                    </span>
                    <div className="h-2 flex-1 rounded-full bg-indigo-200 dark:bg-indigo-800">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{
                          width: `${(prediction.probabilities[l] ?? 0) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-indigo-600 dark:text-indigo-400">
                      {((prediction.probabilities[l] ?? 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-indigo-400">
              Collecting data… (need 6 s of readings)
            </p>
          )}
        </div>

        {/* Sensor sections */}
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
=======
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

        <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Geolocation
        </h2>

        {geoError && (
          <p className="text-red-500 text-sm">{geoError}</p>
        )}

        {geoCoords ? (
          <div className="grid grid-cols-2 gap-6 text-center">
            <div className="flex flex-col items-center rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
              <span className="text-sm uppercase tracking-wider text-zinc-500">
                Latitude
              </span>
              <span className="mt-2 text-2xl font-mono font-bold text-black dark:text-white">
                {geoCoords.latitude.toFixed(6)}
              </span>
              <span className="text-xs text-zinc-400">°</span>
            </div>
            <div className="flex flex-col items-center rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
              <span className="text-sm uppercase tracking-wider text-zinc-500">
                Longitude
              </span>
              <span className="mt-2 text-2xl font-mono font-bold text-black dark:text-white">
                {geoCoords.longitude.toFixed(6)}
              </span>
              <span className="text-xs text-zinc-400">°</span>
            </div>
            <div className="col-span-2 flex flex-col items-center rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
              <span className="text-sm uppercase tracking-wider text-zinc-500">
                Accuracy
              </span>
              <span className="mt-2 text-2xl font-mono font-bold text-black dark:text-white">
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
>>>>>>> parent of ddc28a5 (12 features for device calculation)
      </main>
    </div>
  );
}
